import type { NotificationType, OrderStatus } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { API_ERROR_CODES } from "@remarket/shared";
import type { AuthUser } from "../middleware/auth.js";
import { AppError } from "../middleware/errorHandler.js";
import { enqueueOutbox } from "../outbox/outbox.js";
import { loadCategoryEligibility } from "../services/category-policy.js";
import { createNotification } from "../services/notifications.js";
import { cancelOrder } from "../services/order-cancellation.js";
import { completionBlockReason } from "../shared/dto-mappers.js";
import { accountLocked, conflict, invalidTransition, notFound, orderExpired, validationError, versionConflict } from "../shared/errors.js";
import { prisma } from "../utils/prisma.js";

export type OrderStateAction = "confirm" | "cancel" | "ship" | "deliver" | "complete";

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface OrderActionInput {
  action: OrderStateAction;
  expected_version: number;
  reason?: string;
  carrier?: string;
  tracking_code?: string;
  buyer_confirmed_received?: boolean;
  buyer_confirmed_paid?: boolean;
}

export function hasOpenOrderTicket(
  orderId: string,
  tx?: Prisma.TransactionClient
): Promise<number> {
  const prismaTx = tx ?? prisma;
  return prismaTx.supportTicket.count({
    where: {
      orderId,
      type: "ORDER_PROBLEM",
      status: { in: ["OPEN", "IN_PROGRESS"] },
    },
  });
}

/** Diagnose a missed id/version/status update without exposing other orders. */
export async function conditionalTransition(
  tx: Prisma.TransactionClient,
  order: { id: string; status: OrderStatus; version: number },
  fromStatuses: OrderStatus[],
  expectedVersion: number,
  data: Omit<Prisma.OrderUpdateManyMutationInput, "version">,
): Promise<void> {
  const result = await tx.order.updateMany({
    where: { id: order.id, status: { in: fromStatuses }, version: expectedVersion },
    data: { ...data, version: { increment: 1 } },
  });
  if (result.count === 0) {
    const fresh = await tx.order.findUnique({
      where: { id: order.id },
      select: { status: true, version: true },
    });
    if (!fresh) throw notFound("Không tìm thấy đơn hàng này.");
    if (!fromStatuses.includes(fresh.status)) throw invalidTransition();
    throw versionConflict("Đơn hàng đã thay đổi ở phiên bản khác. Vui lòng tải lại.", {
      current_version: fresh.version,
    });
  }
}

export async function recordTransition(
  tx: Prisma.TransactionClient,
  order: { id: string; code: string; buyerId: string; sellerId: string; status: OrderStatus },
  actor: AuthUser,
  toStatus: OrderStatus,
  reason: string | null,
  notification: { type: NotificationType; title: string; content: string },
): Promise<void> {
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.status,
      toStatus,
      actorType: "USER",
      actorId: actor.id,
      actorName: actor.fullName,
      reason,
    },
  });

  const recipientId = order.buyerId === actor.id ? order.sellerId : order.buyerId;
  await createNotification(tx, {
    data: {
      userId: recipientId,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      referenceType: "order",
      referenceId: order.id,
      dedupeKey: `order:${order.id}:${notification.type}`,
    },
  });
  await enqueueOutbox(
    tx,
    "order.updated",
    order.id,
    `order:${order.id}:status:${toStatus}`,
    {
      order_id: order.id,
      status: toStatus,
      recipients: [order.buyerId, order.sellerId],
    },
  );
}

export async function applyOrderAction(
  orderId: string,
  input: OrderActionInput,
  actor: AuthUser,
): Promise<void> {
  const failure = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${actor.id} FOR SHARE`;
    const liveActor = await tx.user.findUnique({
      where: { id: actor.id },
      select: { status: true },
    });
    if (!liveActor || liveActor.status !== "ACTIVE") throw accountLocked();
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: { items: { select: { productId: true } } },
    });
    if (!order) throw notFound("Không tìm thấy đơn hàng này.");
    if (order.buyerId !== actor.id && order.sellerId !== actor.id) {
      throw notFound("Không tìm thấy đơn hàng này.");
    }

    const productIds = order.items.map((item) => item.productId);
    if (productIds.length) await tx.$queryRaw`
      SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join([...new Set(productIds)].sort())}) ORDER BY "id" FOR UPDATE
    `;
    const now = new Date();
    const isBuyer = order.buyerId === actor.id;
    const isSeller = order.sellerId === actor.id;

    switch (input.action) {
      case "confirm": {
        if (!isSeller) throw invalidTransition("Chỉ người bán mới xác nhận đơn hàng.");
        if (order.status !== "PENDING") {
          throw invalidTransition("Chỉ xác nhận được đơn đang chờ xác nhận.");
        }
        if (order.expiresAt !== null && order.expiresAt.getTime() <= now.getTime()) {
          throw orderExpired();
        }
        if (order.version !== input.expected_version) {
          throw versionConflict("Đơn hàng đã thay đổi ở phiên bản khác. Vui lòng tải lại.", {
            current_version: order.version,
          });
        }

        /* the reservation must still be intact (11.1) */
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          include: { seller: true },
        });
        const eligibleCategories = await loadCategoryEligibility(tx, [...new Set(products.map((product) => product.categoryId))], true);
        let reservationOk = products.length === productIds.length;
        for (const product of products) {
          const valid =
            product.status === "RESERVED" &&
            product.reservedOrderId === order.id &&
            !product.isBlocked &&
            product.deletedAt === null &&
            product.seller.status === "ACTIVE" &&
            product.seller.emailVerifiedAt !== null &&
            (eligibleCategories.has(product.categoryId));
          if (!valid) reservationOk = false;
        }
        if (!reservationOk) {
          const cancelled = await cancelOrder(tx, order, {
            reason: "PRODUCT_NOT_AVAILABLE", at: now, expectedVersion: input.expected_version,
            actor: { type: "SYSTEM", name: "Hệ thống" },
            eventKey: `order:${order.id}:status:CANCELLED`,
            notification: {
              title: "Đơn hàng đã bị hủy",
              content: `Đơn #${order.code} đã hủy vì món đồ không còn khả dụng.`,
              key: (userId) => `order:${order.id}:unavailable:${userId}`,
            },
          });
          if (!cancelled) throw versionConflict();
          // Return the failure and throw only AFTER committing cancellation
          // and releasing reservations; throwing here would undo the cleanup.
          return new AppError(
            API_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
            "Món đồ trong đơn không còn khả dụng.",
            409,
            { product_ids: productIds },
          );
        }

        await conditionalTransition(tx, order, ["PENDING"], input.expected_version, {
          status: "CONFIRMED",
          confirmedAt: now,
        });
        await recordTransition(tx, order, actor, "CONFIRMED", null, {
          type: "ORDER_CONFIRMED",
          title: "Người bán đã xác nhận đơn",
          content: `Đơn #${order.code} đã được xác nhận, chờ giao nhận.`,
        });
        break;
      }

      case "cancel": {
        if (!isBuyer && !isSeller) throw notFound("Không tìm thấy đơn hàng này.");
        if (order.status !== "PENDING" && order.status !== "CONFIRMED") {
          throw invalidTransition("Đơn đã qua bước giao nhận nên không thể hủy ở đây.");
        }
        const reason = input.reason?.trim() ?? "";
        if (reason === "") {
          throw validationError("Vui lòng nhập lý do hủy đơn.", { reason: "Bắt buộc." });
        }

        const moved = await cancelOrder(tx, order, {
          reason, at: now, expectedVersion: input.expected_version,
          actor: { type: "USER", id: actor.id, name: actor.fullName }, eventKey: `order:${order.id}:status:CANCELLED`,
          notification: {
            title: "Đơn hàng đã bị hủy", content: `Đơn #${order.code} đã hủy. ${reason}`,
            recipients: [isBuyer ? order.sellerId : order.buyerId], key: () => `order:${order.id}:ORDER_CANCELLED`
          },
        });
        if (!moved) throw versionConflict("Đơn hàng đã thay đổi ở phiên bản khác. Vui lòng tải lại.", { current_version: order.version });
        break;
      }

      case "ship": {
        if (!isSeller) throw invalidTransition("Chỉ người bán mới gửi hàng.");
        if (order.status !== "CONFIRMED" || order.deliveryMethod !== "COD") {
          throw invalidTransition("Chỉ gửi được đơn COD đã xác nhận.");
        }

        await conditionalTransition(tx, order, ["CONFIRMED"], input.expected_version, {
          status: "SHIPPING",
          shippedAt: now,
        });
        const carrier = input.carrier?.trim() ?? "";
        const trackingCode = input.tracking_code?.trim() ?? "";
        if (carrier !== "" || trackingCode !== "") {
          await tx.orderDeliveryInfo.updateMany({
            where: { orderId: order.id },
            data: {
              ...(carrier !== "" ? { carrier } : {}),
              ...(trackingCode !== "" ? { trackingCode } : {}),
            },
          });
        }
        await recordTransition(tx, order, actor, "SHIPPING", null, {
          type: "ORDER_SHIPPED",
          title: "Đơn hàng đang được giao",
          content: `Đơn #${order.code} đã được gửi${trackingCode !== "" ? ` (mã ${trackingCode})` : ""}.`,
        });
        break;
      }

      case "deliver": {
        let fromStatus: OrderStatus;
        let markBuyerConfirmed = false;

        if (isBuyer && order.status === "CONFIRMED" && order.deliveryMethod === "MEETUP") {
          fromStatus = "CONFIRMED";
          markBuyerConfirmed = true;
        } else if (isBuyer && order.status === "SHIPPING" && order.deliveryMethod === "COD") {
          fromStatus = "SHIPPING";
          markBuyerConfirmed = true;
        } else if (
          isSeller &&
          order.status === "SHIPPING" &&
          order.deliveryMethod === "COD"
        ) {
          fromStatus = "SHIPPING";
        } else {
          throw invalidTransition("Đơn chưa ở bước giao nhận.");
        }

        await conditionalTransition(tx, order, [fromStatus], input.expected_version, {
          status: "DELIVERED",
          deliveredAt: now,
          ...(markBuyerConfirmed ? { buyerConfirmedReceived: true } : {}),
        });
        await recordTransition(tx, order, actor, "DELIVERED", null, {
          type: "ORDER_DELIVERED",
          title: "Đã ghi nhận giao hàng",
          content: `Đơn #${order.code} đã được ghi nhận giao. Người mua kiểm tra hàng và xác nhận hoàn tất.`,
        });
        break;
      }

      case "complete": {
        if (!isBuyer) throw invalidTransition("Chỉ người mua mới xác nhận hoàn tất.");
        if (order.status !== "DELIVERED") {
          throw invalidTransition("Chỉ hoàn tất được đơn đã ghi nhận giao.");
        }
        const openTickets = await hasOpenOrderTicket(order.id, tx);
        if (openTickets > 0) {
          throw conflict(
            API_ERROR_CODES.INVALID_ORDER_TRANSITION,
            completionBlockReason(true) ??
            "Đơn hàng đang có yêu cầu hỗ trợ chưa xử lý. Vui lòng đóng yêu cầu trước khi xác nhận đã nhận.",
          );
        }

        if (input.buyer_confirmed_received !== true || input.buyer_confirmed_paid !== true) {
          throw validationError("Vui lòng xác nhận đã nhận hàng và đã thanh toán.", {
            buyer_confirmed_received: "Bắt buộc xác nhận.",
            buyer_confirmed_paid: "Bắt buộc xác nhận.",
          });
        }

        await conditionalTransition(tx, order, ["DELIVERED"], input.expected_version, {
          status: "COMPLETED",
          completedAt: now,
          buyerConfirmedReceived: true,
          buyerConfirmedPaid: true,
        });
        if (productIds.length > 0) {
          const sold = await tx.product.updateMany({
            where: {
              id: { in: productIds },
              status: "RESERVED",
              reservedOrderId: order.id,
            },
            data: { status: "SOLD", reservedOrderId: null, version: { increment: 1 } },
          });
          if (sold.count !== productIds.length) {
            throw new AppError(
              API_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
              "Reservation của đơn hàng không còn nguyên vẹn.",
              409,
              { product_ids: productIds },
            );
          }
        }
        await recordTransition(tx, order, actor, "COMPLETED", null, {
          type: "ORDER_COMPLETED",
          title: "Đơn hàng đã hoàn tất",
          content: `Người mua đã xác nhận hoàn tất đơn #${order.code}.`,
        });
        break;
      }
    }
  });
  if (failure) throw failure;
}
