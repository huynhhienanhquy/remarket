import { randomUUID } from "node:crypto";
import { backgroundPrisma as prisma } from "../utils/background-prisma.js";

interface Ticket {
  status: "ok" | "error";
  id?: string;
  details?: { error?: string };
}
const PUSH_API = "https://exp.host/--/api/v2/push";
async function expoRequest(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${PUSH_API}/${path}`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Content-Type": "application/json",
      ...(process.env.EXPO_PUSH_ACCESS_TOKEN
        ? { Authorization: `Bearer ${process.env.EXPO_PUSH_ACCESS_TOKEN}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Expo push HTTP ${response.status}`);
  return response.json();
}
export function pushRetryDelay(attempt: number) {
  return Math.min(3_600_000, 15_000 * 2 ** Math.min(attempt, 8));
}
export function pushData(notification: {
  id: string;
  referenceType: string;
  referenceId: string | null;
}) {
  return {
    notification_id: notification.id,
    reference_type: notification.referenceType,
    reference_id: notification.referenceId,
  };
}

/** Separate durable delivery state: realtime processing cannot consume push work. */
export async function deliverMobilePush(): Promise<void> {
  if (process.env.MOBILE_PUSH_ENABLED !== "true") return;
  const deadline = Date.now() + 30_000;
  const now = new Date();
  await prisma.pushRegistration.updateMany({
    where: {
      enabled: true,
      OR: [
        { session: { revokedAt: { not: null } } },
        { session: { expiresAt: { lte: now } } },
        { user: { status: "LOCKED" } },
      ],
    },
    data: { enabled: false },
  });
  // Queue each notification/device pair once, bounded and excluding already queued pairs.
  // Only notifications after registration and within 24 hours generate a remote alert.
  const candidates = await prisma.$queryRaw<
    Array<{ notificationId: string; registrationId: string }>
  >`
    SELECT n.id AS "notificationId", r.id AS "registrationId"
    FROM "Notification" n JOIN "PushRegistration" r ON r."userId" = n."userId" AND r.enabled
    WHERE n."createdAt" >= r."createdAt" AND n."createdAt" > NOW() - INTERVAL '24 hours'
      AND NOT EXISTS (SELECT 1 FROM "PushDelivery" d WHERE d."notificationId" = n.id AND d."registrationId" = r.id)
    ORDER BY n."createdAt", n.id, r.id LIMIT 50`;
  if (candidates.length)
    await prisma.pushDelivery.createMany({
      data: candidates.map((row) => ({ id: randomUUID(), ...row })),
      skipDuplicates: true,
    });
  const dueNow = new Date();
  const deliveries = await prisma.pushDelivery.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING", "SENT"] },
      nextAttemptAt: { lte: dueNow },
    },
    include: {
      notification: true,
      registration: {
        include: { session: true, user: { select: { status: true } } },
      },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
    take: 50,
  });
  for (const delivery of deliveries) {
    // Leave unclaimed work for the next run instead of holding every scheduled job on a slow provider.
    if (Date.now() >= deadline) break;
    const r = delivery.registration;
    const valid =
      r.enabled &&
      !r.session.revokedAt &&
      r.session.expiresAt > now &&
      r.user.status === "ACTIVE" &&
      r.userId === delivery.notification.userId;
    if (!valid) {
      await prisma.pushDelivery.update({
        where: { id: delivery.id },
        data: { status: "SKIPPED" },
      });
      continue;
    }
    if (
      delivery.notification.type === "NEW_MESSAGE" &&
      delivery.notification.referenceId
    ) {
      const conversation = await prisma.conversation.findUnique({
        where: { id: delivery.notification.referenceId },
        select: { buyerId: true, sellerId: true },
      });
      if (
        conversation &&
        (await prisma.userBlock.findFirst({
          where: {
            OR: [
              {
                blockerId: conversation.buyerId,
                blockedId: conversation.sellerId,
              },
              {
                blockerId: conversation.sellerId,
                blockedId: conversation.buyerId,
              },
            ],
          },
        }))
      ) {
        await prisma.pushDelivery.update({
          where: { id: delivery.id },
          data: { status: "SKIPPED" },
        });
        continue;
      }
    }
    const claimed = await prisma.pushDelivery.updateMany({
      where: {
        id: delivery.id,
        status: delivery.status,
        nextAttemptAt: { lte: new Date() },
      },
      data: {
        status: "PROCESSING",
        attempts: { increment: 1 },
        nextAttemptAt: new Date(Date.now() + 120_000),
      },
    });
    if (!claimed.count) continue;
    try {
      if (delivery.ticketId) {
        const result = (await expoRequest("getReceipts", {
          ids: [delivery.ticketId],
        })) as { data?: Record<string, Ticket> };
        const receipt = result.data?.[delivery.ticketId];
        if (!receipt && delivery.attempts < 10) {
          await prisma.pushDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "SENT",
              nextAttemptAt: new Date(Date.now() + 300_000),
            },
          });
          continue;
        }
        if (receipt?.details?.error === "DeviceNotRegistered")
          await prisma.pushRegistration.update({
            where: { id: r.id },
            data: { enabled: false },
          });
        await prisma.pushDelivery.update({
          where: { id: delivery.id },
          data: {
            status: receipt?.status === "ok" ? "DELIVERED" : "FAILED",
            lastError:
              receipt?.details?.error ??
              (receipt ? null : "Receipt unavailable"),
          },
        });
      } else {
        const result = (await expoRequest("send", [
          {
            to: r.token,
            title: "ReMarket",
            body: "Bạn có cập nhật mới. Mở app để xem.",
            sound: "default",
            data: pushData(delivery.notification),
          },
        ])) as { data?: Ticket[] };
        const ticket = result.data?.[0];
        if (ticket?.details?.error === "DeviceNotRegistered") {
          await prisma.pushRegistration.update({
            where: { id: r.id },
            data: { enabled: false },
          });
          await prisma.pushDelivery.update({
            where: { id: delivery.id },
            data: { status: "FAILED", lastError: "DeviceNotRegistered" },
          });
        } else if (ticket?.status === "ok" && ticket.id) {
          await prisma.pushDelivery.update({
            where: { id: delivery.id },
            data: {
              status: "SENT",
              ticketId: ticket.id,
              nextAttemptAt: new Date(Date.now() + 90_000),
              attempts: 0,
              lastError: null,
            },
          });
        } else
          throw new Error(ticket?.details?.error ?? "Invalid Expo push ticket");
      }
    } catch (error) {
      await prisma.pushDelivery.update({
        where: { id: delivery.id },
        data: {
          status:
            delivery.attempts >= 5
              ? "FAILED"
              : delivery.ticketId
                ? "SENT"
                : "PENDING",
          nextAttemptAt: new Date(
            Date.now() + pushRetryDelay(delivery.attempts),
          ),
          lastError:
            error instanceof Error ? error.message : "Push delivery failed",
        },
      });
    }
  }
}
