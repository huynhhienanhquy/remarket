import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AuthRequest } from "../middleware/auth.js";
import { enqueueOutbox } from "../outbox/outbox.js";
import { ok } from "../shared/api-response.js";
import { invalidTransition, notFound, validationError, versionConflict } from "../shared/errors.js";
import { prisma } from "../utils/prisma.js";
import { adminActor, writeAudit } from "../shared/admin-helpers.js";

const router = Router();

const cancelBody = z.object({
  expected_version: z.number().int().min(1),
  reason: z.string().trim().min(1).max(1000),
  ticket_id: z.string().uuid().optional(),
  delivery_outcome: z.enum(["NOT_DELIVERED", "RETURNED"]).optional(),
  payment_resolution: z.string().trim().min(1).max(1000).optional(),
}).strict();

async function activeCategory(
  tx: Prisma.TransactionClient,
  categoryId: string,
): Promise<boolean> {
  const leaf = await tx.category.findUnique({
    where: { id: categoryId },
    include: { parent: true, _count: { select: { children: true } } },
  });
  return Boolean(
    leaf &&
      leaf._count.children === 0 &&
      leaf.status === "ACTIVE" &&
      (leaf.parent === null || leaf.parent.status === "ACTIVE"),
  );
}

router.post(
  "/:id/cancel",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = cancelBody.parse(req.body);
    const orderId = z.string().uuid().safeParse(req.params.id);
    if (!orderId.success) throw notFound("Không tìm thấy đơn hàng này.");

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId.data} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId.data },
        include: { items: { select: { productId: true } } },
      });
      if (!order) throw notFound("Không tìm thấy đơn hàng này.");
      if (["COMPLETED", "CANCELLED"].includes(order.status)) {
        throw invalidTransition("Đơn hàng đã kết thúc nên không thể hủy.");
      }
      if (order.version !== body.expected_version) {
        throw versionConflict("Đơn hàng đã thay đổi. Vui lòng tải lại.", {
          current_version: order.version,
        });
      }

      const afterDelivery = order.status === "SHIPPING" || order.status === "DELIVERED";
      if (afterDelivery) {
        if (!body.ticket_id || !body.delivery_outcome || !body.payment_resolution) {
          throw validationError("Hủy sau khi giao cần kết luận hỗ trợ đầy đủ.", {
            ticket_id: "Bắt buộc.",
            delivery_outcome: "Bắt buộc.",
            payment_resolution: "Bắt buộc.",
          });
        }
        await tx.$queryRaw`SELECT "id" FROM "SupportTicket" WHERE "id" = ${body.ticket_id} FOR UPDATE`;
        const ticket = await tx.supportTicket.findFirst({
          where: {
            id: body.ticket_id,
            orderId: order.id,
            type: "ORDER_PROBLEM",
            status: { in: ["RESOLVED", "CLOSED"] },
          },
        });
        if (!ticket) {
          throw validationError("Ticket hỗ trợ không hợp lệ hoặc chưa có kết luận.", {
            ticket_id: "Ticket phải thuộc đơn này và đã được giải quyết.",
          });
        }
        if ((ticket.resolutionNote ?? "").trim() === "") {
          throw validationError("Ticket hỗ trợ chưa có kết luận.", {
            ticket_id: "Ticket phải có kết luận xử lý trước khi hủy đơn.",
          });
        }
      }

      const now = new Date();
      const moved = await tx.order.updateMany({
        where: { id: order.id, status: order.status, version: order.version },
        data: {
          status: "CANCELLED",
          cancellationReason: body.reason,
          cancelledById: actor.id,
          cancelledAt: now,
          expiresAt: null,
          version: { increment: 1 },
        },
      });
      if (moved.count !== 1) throw versionConflict();

      const products = await tx.product.findMany({
        where: { id: { in: order.items.map((item) => item.productId) }, reservedOrderId: order.id },
        include: { seller: true },
      });
      for (const product of products) {
        const sellable =
          !afterDelivery &&
          product.deletedAt === null &&
          !product.isBlocked &&
          product.seller.status === "ACTIVE" &&
          product.seller.emailVerifiedAt !== null &&
          (await activeCategory(tx, product.categoryId));
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
          actorId: actor.id,
          actorName: actor.fullName,
          reason: body.reason,
        },
      });
      await tx.notification.createMany({
        data: [order.buyerId, order.sellerId].map((userId) => ({
          userId,
          type: "ORDER_CANCELLED" as const,
          title: "Quản trị viên đã hủy đơn",
          content: `Đơn ${order.code} đã hủy sau khi xử lý hỗ trợ.`,
          referenceType: "order",
          referenceId: order.id,
          dedupeKey: `order:${order.id}:admin-cancel:${userId}`,
        })),
        skipDuplicates: true,
      });
      await enqueueOutbox(tx, "order.updated", order.id, `order:${order.id}:admin-cancel`, {
        order_id: order.id,
        status: "CANCELLED",
        recipients: [order.buyerId, order.sellerId],
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: "order.cancel",
        entityType: "order",
        entityId: order.id,
        reason: body.reason,
        metadata: {
          from_status: order.status,
          ticket_id: body.ticket_id ?? null,
          delivery_outcome: body.delivery_outcome ?? null,
          payment_resolution: body.payment_resolution ?? null,
        },
      });
      return { id: order.id, status: "CANCELLED" as const, version: order.version + 1 };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    ok(res, result);
  }),
);

export { router as adminOrdersRouter };
