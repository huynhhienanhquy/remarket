import type { Prisma } from "@prisma/client";
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
        update: {},
      });
      escalatedOrders += 1;
      continue;
    }

    const moved = await tx.order.updateMany({
      where: { id: order.id, status: order.status, version: order.version },
      data: {
        status: "CANCELLED",
        cancellationReason: "PRODUCT_BLOCKED",
        cancelledById: input.actor.id,
        cancelledAt: new Date(),
        expiresAt: null,
        version: { increment: 1 },
      },
    });
    if (moved.count !== 1) continue;
    cancelledOrders += 1;

    const reserved = await tx.product.findMany({
      where: { reservedOrderId: order.id },
      include: {
        seller: true,
        category: { include: { parent: true, _count: { select: { children: true } } } },
      },
    });
    for (const item of reserved) {
      const sellable =
        item.id !== product.id &&
        item.deletedAt === null &&
        !item.isBlocked &&
        item.seller.status === "ACTIVE" &&
        item.seller.emailVerifiedAt !== null &&
        item.category._count.children === 0 &&
        item.category.status === "ACTIVE" &&
        (item.category.parent === null || item.category.parent.status === "ACTIVE");
      await tx.product.updateMany({
        where: { id: item.id, status: "RESERVED", reservedOrderId: order.id },
        data: {
          status: sellable ? "ACTIVE" : "INACTIVE",
          reservedOrderId: null,
          version: { increment: 1 },
        },
      });
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "CANCELLED",
        actorType: "ADMIN",
        actorId: input.actor.id,
        actorName: input.actor.fullName,
        reason: "PRODUCT_BLOCKED",
      },
    });
    await tx.notification.createMany({
      data: [order.buyerId, order.sellerId].map((userId) => ({
        userId,
        type: "ORDER_CANCELLED" as const,
        title: "Đơn hàng đã bị hủy",
        content: `Đơn ${order.code} đã hủy vì một sản phẩm bị chặn.`,
        referenceType: "order",
        referenceId: order.id,
        dedupeKey: `order:${order.id}:product-blocked:${product.id}:${userId}`,
      })),
      skipDuplicates: true,
    });
    await enqueueOutbox(
      tx,
      "order.updated",
      order.id,
      `order:${order.id}:product-blocked:${product.id}`,
      {
        order_id: order.id,
        status: "CANCELLED",
        recipients: [order.buyerId, order.sellerId],
      },
    );
  }

  await tx.notification.createMany({
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
    include: { items: { select: { productId: true } } },
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
        update: {},
      });
      escalatedOrders += 1;
      continue;
    }

    const moved = await tx.order.updateMany({
      where: { id: order.id, status: order.status, version: order.version },
      data: {
        status: "CANCELLED",
        cancellationReason: "ACCOUNT_LOCKED",
        cancelledById: input.actor.id,
        cancelledAt: lockedAt,
        expiresAt: null,
        version: { increment: 1 },
      },
    });
    if (moved.count !== 1) continue;
    cancelledOrders += 1;

    const productIds = order.items.map((item) => item.productId);
    const products = await tx.product.findMany({
      where: { id: { in: productIds }, reservedOrderId: order.id },
      include: {
        seller: true,
        category: { include: { parent: true, _count: { select: { children: true } } } },
      },
    });
    for (const product of products) {
      const sellable =
        product.sellerId !== target.id &&
        product.deletedAt === null &&
        !product.isBlocked &&
        product.seller.status === "ACTIVE" &&
        product.seller.emailVerifiedAt !== null &&
        product.category._count.children === 0 &&
        product.category.status === "ACTIVE" &&
        (product.category.parent === null || product.category.parent.status === "ACTIVE");
      await tx.product.updateMany({
        where: { id: product.id, reservedOrderId: order.id, status: "RESERVED" },
        data: {
          status: sellable ? "ACTIVE" : "INACTIVE",
          reservedOrderId: null,
          version: { increment: 1 },
        },
      });
    }
    await tx.orderStatusHistory.create({
      data: {
        orderId: order.id,
        fromStatus: order.status,
        toStatus: "CANCELLED",
        actorType: "ADMIN",
        actorId: input.actor.id,
        actorName: input.actor.fullName,
        reason: `ACCOUNT_LOCKED:${target.id}`,
      },
    });
    await tx.notification.createMany({
      data: [order.buyerId, order.sellerId].map((userId) => ({
        userId,
        type: "ORDER_CANCELLED" as const,
        title: "Đơn hàng đã bị hủy",
        content: `Đơn ${order.code} đã hủy do một tài khoản tham gia bị khóa.`,
        referenceType: "order",
        referenceId: order.id,
        dedupeKey: `order:${order.id}:account-locked:${target.id}:${userId}`,
      })),
      skipDuplicates: true,
    });
    await enqueueOutbox(
      tx,
      "order.updated",
      order.id,
      `order:${order.id}:account-locked:${target.id}`,
      {
        order_id: order.id,
        status: "CANCELLED",
        recipients: [order.buyerId, order.sellerId],
      },
    );
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
