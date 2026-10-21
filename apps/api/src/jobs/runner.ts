import { createNotifications } from "../services/notifications.js";
import { cancelOrder } from "../services/order-cancellation.js";
import { backgroundPrisma as prisma } from "../utils/background-prisma.js";
import { enqueueOutbox, processOutboxBatch } from "../outbox/outbox.js";
import { deliverAuthEmail } from "../services/email.js";
import { deleteStorageObject } from "../services/storage.js";
import { cleanupExpiredRecords } from "./retention.js";
import { deliverMobilePush } from "./push.js";

const BATCH_SIZE = 50;
const CONFIRMED_REMINDER_MS = 72 * 60 * 60 * 1000;
const ORPHAN_UPLOAD_MS = 24 * 60 * 60 * 1000;

export interface WorkerSnapshot {
  running: boolean;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
}

const snapshot: WorkerSnapshot = {
  running: false,
  last_run_at: null,
  last_success_at: null,
  last_error: null,
};
let outboxRunning = false;

const HEARTBEAT_ID = "jobs";

async function persistWorkerSnapshot(): Promise<void> {
  await prisma.workerHeartbeat.upsert({
    where: { id: HEARTBEAT_ID },
    create: {
      id: HEARTBEAT_ID,
      running: snapshot.running,
      lastRunAt: snapshot.last_run_at ? new Date(snapshot.last_run_at) : null,
      lastSuccessAt: snapshot.last_success_at ? new Date(snapshot.last_success_at) : null,
      lastError: snapshot.last_error,
    },
    update: {
      running: snapshot.running,
      lastRunAt: snapshot.last_run_at ? new Date(snapshot.last_run_at) : null,
      lastSuccessAt: snapshot.last_success_at ? new Date(snapshot.last_success_at) : null,
      lastError: snapshot.last_error,
    },
  });
}

export async function expirePendingOrders(): Promise<number> {
  const candidates = await prisma.order.findMany({
    where: { status: "PENDING", expiresAt: { lte: new Date() } },
    select: { id: true },
    orderBy: { expiresAt: "asc" },
    take: BATCH_SIZE,
  });
  let expired = 0;

  for (const candidate of candidates) {
    const won = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE`;
      const order = await tx.order.findUnique({ where: { id: candidate.id } });
      if (!order || order.status !== "PENDING" || !order.expiresAt || order.expiresAt > new Date()) {
        return false;
      }

      return cancelOrder(tx, order, {
        reason: "SELLER_TIMEOUT", actor: { type: "SYSTEM", name: "Hệ thống" }, eventKey: `order:${order.id}:expired`,
        notification: { title: "Đơn hàng đã hết hạn", content: `Đơn ${order.code} đã tự động hủy vì người bán không xác nhận đúng hạn.`,
          key: (userId) => `order:${order.id}:expired:${userId}` },
      });
    });
    if (won) expired += 1;
  }
  return expired;
}

export async function createOrderReminders(): Promise<number> {
  const cutoff = new Date(Date.now() - CONFIRMED_REMINDER_MS);
  const orders = await prisma.$queryRaw<Array<{ id: string; code: string; sellerId: string }>>`
    SELECT o."id", o."code", o."sellerId" FROM "Order" o
    WHERE o."status" = 'CONFIRMED' AND o."confirmedAt" <= ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM "Notification" n
        WHERE n."userId" = o."sellerId" AND n."dedupeKey" = 'order:' || o."id" || ':confirmed-72h'
      )
    ORDER BY o."confirmedAt", o."id" LIMIT ${BATCH_SIZE}
  `;
  if (orders.length === 0) return 0;
  const result = await prisma.$transaction((tx) => createNotifications(tx, {
    data: orders.map((order) => ({
      userId: order.sellerId,
      type: "ORDER_REMINDER",
      title: "Nhắc gửi hàng",
      content: `Đơn ${order.code} đã được xác nhận hơn 72 giờ. Hãy cập nhật tiến độ giao hàng.`,
      referenceType: "order",
      referenceId: order.id,
      dedupeKey: `order:${order.id}:confirmed-72h`,
    })),
    skipDuplicates: true,
  }));
  return result.count;
}

export async function cleanupOrphanUploads(): Promise<number> {
  const cutoff = new Date(Date.now() - ORPHAN_UPLOAD_MS);
  const rows = await prisma.uploadAsset.findMany({
    where: { attachedAt: null, createdAt: { lte: cutoff } },
    select: { id: true },
    take: BATCH_SIZE,
  });
  let removed = 0;
  for (const row of rows) {
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "UploadAsset" WHERE "id" = ${row.id} FOR UPDATE`;
      const current = await tx.uploadAsset.findUnique({ where: { id: row.id } });
      if (!current || current.attachedAt !== null || current.createdAt > cutoff) return false;

      await tx.uploadAsset.delete({ where: { id: current.id } });
      await enqueueOutbox(
        tx,
        "storage.delete",
        current.id,
        `storage-delete:${current.id}`,
        { storage_path: current.storagePath },
      );
      return true;
    });
    if (claimed) removed += 1;
  }
  return removed;
}

export async function collectWorkerMetrics(): Promise<{
  expired_orders_pending: number;
  outbox_pending: number;
  outbox_dead_letter: number;
  orphan_uploads: number;
}> {
  const [expired, pending, dead, orphan] = await Promise.all([
    prisma.order.count({ where: { status: "PENDING", expiresAt: { lte: new Date() } } }),
    prisma.outboxEvent.count({ where: { processedAt: null, attempts: { lt: 10 } } }),
    prisma.outboxEvent.count({ where: { processedAt: null, attempts: { gte: 10 } } }),
    prisma.uploadAsset.count({
      where: { attachedAt: null, createdAt: { lte: new Date(Date.now() - ORPHAN_UPLOAD_MS) } },
    }),
  ]);
  return {
    expired_orders_pending: expired,
    outbox_pending: pending,
    outbox_dead_letter: dead,
    orphan_uploads: orphan,
  };
}

export async function runJobsOnce(): Promise<void> {
  if (snapshot.running) return;
  snapshot.running = true;
  snapshot.last_run_at = new Date().toISOString();
  try {
    await persistWorkerSnapshot();
    await expirePendingOrders();
    await createOrderReminders();
    await cleanupOrphanUploads();
    await cleanupExpiredRecords();
    await drainOutbox();
    await deliverMobilePush();
    snapshot.last_success_at = new Date().toISOString();
    snapshot.last_error = null;
  } catch (error) {
    snapshot.last_error = error instanceof Error ? error.message : "Unknown worker error";
    throw error;
  } finally {
    snapshot.running = false;
    await persistWorkerSnapshot().catch((error) => {
      console.error(
        "Worker heartbeat update failed:",
        error instanceof Error ? error.message : "Unknown heartbeat error",
      );
    });
  }
}

async function drainOutbox(): Promise<void> {
  if (outboxRunning) return;
  outboxRunning = true;
  try {
    await processOutboxBatch(async (event) => {
      if (event.eventType === "email.auth") {
        await deliverAuthEmail(event);
        return;
      }
      if (event.eventType === "storage.delete") {
        const payload = event.payload;
        if (
          payload === null ||
          Array.isArray(payload) ||
          typeof payload !== "object" ||
          typeof payload.storage_path !== "string"
        ) {
          throw new Error("Invalid storage.delete outbox payload.");
        }
        await deleteStorageObject(payload.storage_path);
      }
    }, BATCH_SIZE, prisma);
  } finally {
    outboxRunning = false;
  }
}

export async function workerSnapshot(): Promise<WorkerSnapshot> {
  if (snapshot.last_run_at !== null) return { ...snapshot };
  const shared = await prisma.workerHeartbeat.findUnique({ where: { id: HEARTBEAT_ID } });
  if (!shared) return { ...snapshot };
  return {
    running: shared.running,
    last_run_at: shared.lastRunAt?.toISOString() ?? null,
    last_success_at: shared.lastSuccessAt?.toISOString() ?? null,
    last_error: shared.lastError,
  };
}

export function startJobRunner(intervalMs: number, outboxIntervalMs = 1_000): () => void {
  let stopped = false;
  const execute = (): void => {
    if (stopped) return;
    void runJobsOnce().catch((error) => {
      console.error("Background job failed:", error instanceof Error ? error.message : error);
    });
  };
  execute();
  const timer = setInterval(execute, intervalMs);
  timer.unref();
  const outboxTimer = setInterval(() => {
    if (stopped) return;
    void drainOutbox().catch((error) => {
      console.error("Outbox pump failed:", error instanceof Error ? error.message : error);
    });
  }, outboxIntervalMs);
  outboxTimer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
    clearInterval(outboxTimer);
  };
}
