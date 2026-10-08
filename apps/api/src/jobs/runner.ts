import type { Prisma } from "@prisma/client";
import { backgroundPrisma as prisma } from "../utils/background-prisma.js";
import { enqueueOutbox, processOutboxBatch } from "../outbox/outbox.js";
import { deliverAuthEmail } from "../services/email.js";
import { deleteStorageObject } from "../services/storage.js";

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

async function categoryActive(tx: Prisma.TransactionClient, categoryId: string): Promise<boolean> {
  if ((await tx.category.count({ where: { parentId: categoryId } })) > 0) return false;
  const visited = new Set<string>();
  let cursor: string | null = categoryId;
  while (cursor) {
    if (visited.has(cursor)) return false;
    visited.add(cursor);
    const category: { parentId: string | null; status: string } | null = await tx.category.findUnique({
      where: { id: cursor },
      select: { parentId: true, status: true },
    });
    if (!category || category.status !== "ACTIVE") return false;
    cursor = category.parentId;
  }
  return true;
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

      const products = await tx.product.findMany({
        where: { reservedOrderId: order.id },
        include: { seller: { select: { status: true, emailVerifiedAt: true } } },
      });
      const now = new Date();
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING", version: order.version },
        data: {
          status: "CANCELLED",
          cancellationReason: "SELLER_TIMEOUT",
          cancelledAt: now,
          version: { increment: 1 },
        },
      });
      if (moved.count !== 1) return false;

      for (const product of products) {
        const eligible =
          product.deletedAt === null &&
          !product.isBlocked &&
          product.seller.status === "ACTIVE" &&
          product.seller.emailVerifiedAt !== null &&
          (await categoryActive(tx, product.categoryId));
        await tx.product.updateMany({
          where: { id: product.id, reservedOrderId: order.id, status: "RESERVED" },
          data: {
            status: eligible ? "ACTIVE" : "INACTIVE",
            reservedOrderId: null,
            version: { increment: 1 },
          },
        });
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: "PENDING",
          toStatus: "CANCELLED",
          actorType: "SYSTEM",
          actorName: "Hệ thống",
          reason: "SELLER_TIMEOUT",
        },
      });
      await tx.notification.createMany({
        data: [order.buyerId, order.sellerId].map((userId) => ({
          userId,
          type: "ORDER_CANCELLED" as const,
          title: "Đơn hàng đã hết hạn",
          content: `Đơn ${order.code} đã tự động hủy vì người bán không xác nhận đúng hạn.`,
          referenceType: "order",
          referenceId: order.id,
          dedupeKey: `order:${order.id}:expired:${userId}`,
        })),
        skipDuplicates: true,
      });
      await enqueueOutbox(tx, "order.updated", order.id, `order:${order.id}:expired`, {
        order_id: order.id,
        status: "CANCELLED",
        recipients: [order.buyerId, order.sellerId],
      });
      return true;
    });
    if (won) expired += 1;
  }
  return expired;
}

export async function createOrderReminders(): Promise<number> {
  const cutoff = new Date(Date.now() - CONFIRMED_REMINDER_MS);
  const orders = await prisma.order.findMany({
    where: { status: "CONFIRMED", confirmedAt: { lte: cutoff } },
    select: { id: true, code: true, sellerId: true },
    take: BATCH_SIZE,
  });
  let created = 0;
  for (const order of orders) {
    const result = await prisma.notification.createMany({
      data: [{
        userId: order.sellerId,
        type: "ORDER_REMINDER",
        title: "Nhắc gửi hàng",
        content: `Đơn ${order.code} đã được xác nhận hơn 72 giờ. Hãy cập nhật tiến độ giao hàng.`,
        referenceType: "order",
        referenceId: order.id,
        dedupeKey: `order:${order.id}:confirmed-72h`,
      }],
      skipDuplicates: true,
    });
    created += result.count;
  }
  return created;
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
    await drainOutbox();
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
