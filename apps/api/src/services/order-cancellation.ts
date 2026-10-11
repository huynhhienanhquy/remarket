import type { Order, Prisma } from "@prisma/client";
import { createNotifications } from "./notifications.js";
import { releaseReservedProducts } from "./reservations.js";
import { enqueueOutbox } from "../outbox/outbox.js";

type CancellationOrder = Pick<Order, "id" | "code" | "buyerId" | "sellerId" | "status" | "version">;
interface CancellationOptions {
  reason: string;
  historyReason?: string;
  actor: { type: "USER" | "ADMIN" | "SYSTEM"; id?: string; name: string };
  expectedVersion?: number;
  at?: Date;
  allowAfterDelivery?: boolean;
  notification: { title: string; content: string; recipients?: string[]; key: (userId: string) => string };
  eventKey: string;
}

/** Caller holds Order lock. All cancellation effects share its transaction. */
export async function cancelOrder(tx: Prisma.TransactionClient, order: CancellationOrder, options: CancellationOptions): Promise<boolean> {
  const beforeDelivery = order.status === "PENDING" || order.status === "CONFIRMED";
  if (!beforeDelivery && !(options.allowAfterDelivery && ["SHIPPING", "DELIVERED"].includes(order.status))) return false;
  const moved = await tx.order.updateMany({
    where: { id: order.id, status: order.status, version: options.expectedVersion ?? order.version },
    data: { status: "CANCELLED", cancellationReason: options.reason, cancelledById: options.actor.id ?? null,
      cancelledAt: options.at ?? new Date(), expiresAt: null, version: { increment: 1 } },
  });
  if (moved.count !== 1) return false;
  // Listings involved in delivery remain hidden even when an admin authorizes
  // cancellation. Returning goods never silently republishes a used listing.
  await releaseReservedProducts(tx, order.id, { reactivate: beforeDelivery });
  await tx.orderStatusHistory.create({ data: { orderId: order.id, fromStatus: order.status, toStatus: "CANCELLED",
    actorType: options.actor.type, actorId: options.actor.id ?? null, actorName: options.actor.name,
    reason: options.historyReason ?? options.reason } });
  await createNotifications(tx, { data: (options.notification.recipients ?? [order.buyerId, order.sellerId]).map((userId) => ({
    userId, type: "ORDER_CANCELLED", title: options.notification.title, content: options.notification.content,
    referenceType: "order", referenceId: order.id, dedupeKey: options.notification.key(userId),
  })), skipDuplicates: true });
  await enqueueOutbox(tx, "order.updated", order.id, options.eventKey, {
    order_id: order.id, status: "CANCELLED", recipients: [order.buyerId, order.sellerId],
  });
  return true;
}
