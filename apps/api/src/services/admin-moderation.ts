import { cancelOrder } from "./order-cancellation.js";
import { createNotifications } from "./notifications.js";
import { Prisma } from "@prisma/client";
import { enqueueOutbox } from "../outbox/outbox.js";
import type { AdminActor } from "../shared/admin-helpers.js";
import { writeAudit } from "../shared/admin-helpers.js";
import { forbidden, notFound, versionConflict } from "../shared/errors.js";

type AuditMetadata = Record<string, unknown>;

export async function blockProduct(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    reason: string;
    actor: AdminActor;
    expectedVersion?: number;
    auditMetadata?: AuditMetadata;
  },
) {
  const initial = await tx.product.findUnique({ where: { id: input.productId } });
  if (!initial || initial.deletedAt !== null) throw notFound("Không tìm thấy tin đăng để chặn.");
  // Checkout also locks seller before creating orders. Acquire every affected
  // Order before Product, so buyer cancellation cannot invert these locks.
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${initial.sellerId} FOR UPDATE`;
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Order" WHERE "id" IN (
      SELECT "orderId" FROM "OrderItem" WHERE "productId" = ${input.productId}
    ) ORDER BY "id" FOR UPDATE
  `);
  await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${input.productId} FOR UPDATE`;
  const product = await tx.product.findUnique({ where: { id: input.productId } });
  if (product === null || product.deletedAt !== null) {
    throw notFound("Không tìm thấy tin đăng để chặn.");
  }
  if (input.expectedVersion !== undefined && product.version !== input.expectedVersion) {
    throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại và xem xét bản mới nhất.");
  }

  const nextVersion = product.version + 1;
  const saved = await tx.product.update({
    where: { id: product.id },
    data: { isBlocked: true, blockReason: input.reason, version: { increment: 1 } },
  });

  const affectedOrders = await tx.order.findMany({
    where: {
      items: { some: { productId: product.id } },
      status: { in: ["PENDING", "CONFIRMED", "SHIPPING", "DELIVERED"] },
    },
  });
  let cancelledOrders = 0;
  let escalatedOrders = 0;

  for (const candidate of affectedOrders) {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: candidate.id } });
    if (!order || order.status === "COMPLETED" || order.status === "CANCELLED") continue;
    if (order.status === "SHIPPING" || order.status === "DELIVERED") {
      await tx.supportTicket.upsert({
        where: { code: `SYS-${order.code}-PRODUCT` },
        create: {
          code: `SYS-${order.code}-PRODUCT`,
          userId: order.buyerId,
          orderId: order.id,
          subject: `Sản phẩm bị chặn trong đơn ${order.code}`,
          type: "ORDER_PROBLEM",
          status: "OPEN",
        },
        update: { status: "OPEN", resolvedAt: null, closedAt: null, resolutionNote: null },
      });
      escalatedOrders += 1;
      continue;
    }

    const won = await cancelOrder(tx, order, {
      reason: "PRODUCT_BLOCKED", actor: { type: "ADMIN", id: input.actor.id, name: input.actor.fullName },
      eventKey: `order:${order.id}:product-blocked:${product.id}`,
      notification: { title: "Đơn hàng đã bị hủy", content: `Đơn ${order.code} đã hủy vì một sản phẩm bị chặn.`,
        key: (userId) => `order:${order.id}:product-blocked:${product.id}:${userId}` },
    });
    if (won) cancelledOrders += 1;
  }

  await createNotifications(tx, {
    data: [{
      userId: product.sellerId,
      type: "PRODUCT_BLOCKED",
      title: "Tin đăng bị chặn",
      content: `Tin đăng "${product.title}" đã bị chặn hiển thị. Lý do: ${input.reason}`,
      referenceType: "product",
      referenceId: product.id,
      dedupeKey: `product-blocked:${product.id}:v${nextVersion}`,
    }],
    skipDuplicates: true,
  });
  await writeAudit(tx, {
    actorId: input.actor.id,
    actorName: input.actor.fullName,
    action: "product.block",
    entityType: "product",
    entityId: product.id,
    reason: input.reason,
    metadata: {
      ...(input.auditMetadata ?? {}),
      version: nextVersion,
      cancelled_orders: cancelledOrders,
      escalated_orders: escalatedOrders,
    },
  });
  return saved;
}

export async function lockUser(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    reason: string;
    actor: AdminActor;
    auditMetadata?: AuditMetadata;
  },
) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
  const target = await tx.user.findUnique({ where: { id: input.userId } });
  if (target === null) throw notFound("Không tìm thấy người dùng để khóa.");
  if (target.id === input.actor.id) throw forbidden("Không thể khóa tài khoản của chính bạn.");
  if (target.role === "ADMIN") throw forbidden("Không thể khóa tài khoản quản trị viên khác.");

  const lockedAt = new Date();
  const saved = await tx.user.update({
    where: { id: target.id },
    data: { status: "LOCKED", lockReason: input.reason, lockedAt },
  });
  await tx.session.updateMany({
    where: { userId: target.id },
    data: { revokedAt: lockedAt },
  });
  await tx.authToken.updateMany({
    where: { userId: target.id, purpose: "REFRESH", consumedAt: null },
    data: { consumedAt: lockedAt },
  });
  await enqueueOutbox(
    tx,
    "session.revoked",
    target.id,
    `session-revoked:user:${target.id}:${lockedAt.getTime()}`,
    { user_id: target.id },
  );

  const affectedOrders = await tx.order.findMany({
    where: {
      OR: [{ buyerId: target.id }, { sellerId: target.id }],
      status: { in: ["PENDING", "CONFIRMED", "SHIPPING", "DELIVERED"] },
    },
    orderBy: { id: "asc" },
  });
  let cancelledOrders = 0;
  let escalatedOrders = 0;

  for (const candidate of affectedOrders) {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${candidate.id} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: candidate.id },
      include: { items: { select: { productId: true } } },
    });
    if (!order || order.status === "COMPLETED" || order.status === "CANCELLED") continue;
    if (order.status === "SHIPPING" || order.status === "DELIVERED") {
      await tx.supportTicket.upsert({
        where: { code: `SYS-${order.code}-LOCK` },
        create: {
          code: `SYS-${order.code}-LOCK`,
          userId: order.buyerId,
          orderId: order.id,
          subject: `Tài khoản bị khóa trong đơn ${order.code}`,
          type: "ORDER_PROBLEM",
          status: "OPEN",
        },
        update: { status: "OPEN", resolvedAt: null, closedAt: null, resolutionNote: null },
      });
      escalatedOrders += 1;
      continue;
    }

    const won = await cancelOrder(tx, order, {
      reason: "ACCOUNT_LOCKED", historyReason: `ACCOUNT_LOCKED:${target.id}`, at: lockedAt,
      actor: { type: "ADMIN", id: input.actor.id, name: input.actor.fullName },
      eventKey: `order:${order.id}:account-locked:${target.id}`,
      notification: { title: "Đơn hàng đã bị hủy", content: `Đơn ${order.code} đã hủy do một tài khoản tham gia bị khóa.`,
        key: (userId) => `order:${order.id}:account-locked:${target.id}:${userId}` },
    });
    if (won) cancelledOrders += 1;
  }

  const hiddenProducts = await tx.product.updateMany({
    where: {
      sellerId: target.id,
      status: { in: ["PENDING", "ACTIVE", "REJECTED"] },
      deletedAt: null,
    },
    data: { status: "INACTIVE", version: { increment: 1 } },
  });
  await writeAudit(tx, {
    actorId: input.actor.id,
    actorName: input.actor.fullName,
    action: "user.lock",
    entityType: "user",
    entityId: target.id,
    reason: input.reason,
    metadata: {
      ...(input.auditMetadata ?? {}),
      status: "LOCKED",
      cancelled_orders: cancelledOrders,
      escalated_orders: escalatedOrders,
      hidden_products: hiddenProducts.count,
    },
  });
  return saved;
}
