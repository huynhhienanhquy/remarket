import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { NotificationType, OrderStatus } from "@prisma/client";
import type { OrderDetail, OrderListItem } from "@remarket/shared";
import { API_ERROR_CODES, REVIEW_LIMITS, validateReviewComment } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { requireActive, requireVerified } from "../middleware/auth.js";
import type { AuthRequest, AuthUser } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
import { DEFAULT_PAGE_SIZE, offsetOf, pageMeta } from "../shared/pagination.js";
import {
  accountLocked,
  conflict,
  forbidden,
  invalidTransition,
  notFound,
  orderExpired,
  reviewNotAllowed,
  unauthorized,
  validationError,
  versionConflict,
} from "../shared/errors.js";
import {
  completionBlockReason,
  toOrderDetail,
  toOrderListItem,
  toReview,
  toSellerSummary,
} from "../shared/dto-mappers.js";
import type { OrderRow } from "../shared/dto-mappers.js";
import { EMPTY_AGGREGATES, loadSellerAggregates } from "../shared/seller-aggregates.js";
import type { SellerAggregates } from "../shared/seller-aggregates.js";
import { enqueueOutbox } from "../outbox/outbox.js";

/**
 * Order list / detail / state machine / review (detail-project 11 + 14.1).
 *
 * Every transition is one transaction: a conditional update on
 * `id + version + status`, product reservation handling, an immutable status
 * history row and a deduplicated notification for the counterpart. Reads never
 * require an ACTIVE account (a LOCKED user keeps access to their orders,
 * detail-project 6); mutations do.
 */

const router = Router();

const ORDER_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "SHIPPING",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
] as const;

type OrderStateAction = "confirm" | "cancel" | "ship" | "deliver" | "complete";

const DAY_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------ *
 * Input
 * ------------------------------------------------------------------ */

const orderListQuerySchema = z
  .object({
    role: z.enum(["buyer", "seller"]).default("buyer"),
    status: z.enum([...ORDER_STATUSES, "ALL"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
    page_size: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

const orderActionSchema = z
  .object({
    action: z.enum(["confirm", "cancel", "ship", "deliver", "complete", "support", "chat"]),
    expected_version: z.number().int().min(1),
    reason: z.string().trim().max(500, "Lý do tối đa 500 ký tự.").optional(),
    carrier: z.string().trim().max(100, "Đơn vị vận chuyển tối đa 100 ký tự.").optional(),
    tracking_code: z.string().trim().max(100, "Mã vận đơn tối đa 100 ký tự.").optional(),
    buyer_confirmed_received: z.boolean().optional(),
    buyer_confirmed_paid: z.boolean().optional(),
  })
  .strict();

const reviewSchema = z
  .object({
    rating: z.number().int().min(1, "Điểm đánh giá từ 1 đến 5.").max(5, "Điểm đánh giá từ 1 đến 5."),
    comment: z.string().trim().max(REVIEW_LIMITS.commentMax).nullable().optional(),
    expected_version: z.number().int().optional(),
  })
  .strict();

interface OrderActionInput {
  action: OrderStateAction;
  expected_version: number;
  reason?: string;
  carrier?: string;
  tracking_code?: string;
  buyer_confirmed_received?: boolean;
  buyer_confirmed_paid?: boolean;
}

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

function parseId(raw: string | undefined): string {
  const parsed = z.string().uuid().safeParse(raw ?? "");
  if (!parsed.success) throw notFound("Không tìm thấy đơn hàng này.");
  return parsed.data;
}

function viewerOf(req: AuthRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Leaf and every ancestor must be ACTIVE when a reservation is released (9.1). */
async function categoryChainActive(
  tx: Prisma.TransactionClient,
  categoryId: string,
  cache: Map<string, boolean>,
): Promise<boolean> {
  const cached = cache.get(categoryId);
  if (cached !== undefined) return cached;

  const visited = new Set<string>();
  let cursor: string | null = categoryId;
  let active = (await tx.category.count({ where: { parentId: categoryId } })) === 0;
  while (cursor !== null) {
    if (visited.has(cursor)) {
      active = false;
      break;
    }
    visited.add(cursor);
    const node: Prisma.CategoryGetPayload<{ select: { status: true; parentId: true } }> | null =
      await tx.category.findUnique({
        where: { id: cursor },
        select: { status: true, parentId: true },
      });
    if (!node || node.status !== "ACTIVE") {
      active = false;
      break;
    }
    cursor = node.parentId;
  }

  cache.set(categoryId, active);
  return active;
}

/**
 * The conversation attached to an order is the thread about one of its
 * products between exactly this buyer and seller (detail-project 11.2).
 */
async function orderConversation(order: {
  buyerId: string;
  sellerId: string;
  items: Array<{ productId: string }>;
}): Promise<{ id: string } | null> {
  if (order.items.length === 0) return null;
  return prisma.conversation.findFirst({
    where: {
      buyerId: order.buyerId,
      sellerId: order.sellerId,
      productId: { in: order.items.map((item) => item.productId) },
    },
    select: { id: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}

async function loadOrderRow(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      buyer: true,
      seller: true,
      deliveryInfo: true,
      statusHistory: true,
      review: true,
    },
  });
  if (!order) return null;
  return { ...order, conversation: await orderConversation(order) };
}

function hasOpenOrderTicket(
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

/**
 * Batch reputation for the counterparty injected into the shared mapper —
 * the mapper itself ships with zeroed aggregates.
 */
function counterpartySummary(
  base: OrderListItem,
  row: OrderRow,
  aggregates: ReadonlyMap<string, SellerAggregates>,
): ReturnType<typeof toSellerSummary> {
  const counterparty = base.role === "seller" ? row.buyer : row.seller;
  return toSellerSummary(counterparty, aggregates.get(counterparty.id) ?? EMPTY_AGGREGATES);
}

type OrderDetailRow = NonNullable<Awaited<ReturnType<typeof loadOrderRow>>>;

async function buildDetail(row: OrderDetailRow, viewer: AuthUser): Promise<OrderDetail> {
  const openTickets = await hasOpenOrderTicket(row.id);
  const hasOpenTicket = openTickets > 0;
  const base = toOrderDetail(row, viewer, {
    hasOpenTicket,
    existingReview: row.review,
    completionReason: completionBlockReason(hasOpenTicket),
  });
  const aggregates = await loadSellerAggregates([base.counterparty.id]);
  return { ...base, counterparty: counterpartySummary(base, row, aggregates) };
}

/** Loads a row the caller may see; strangers get 404 instead of 403 (17). */
async function loadParticipantOrder(orderId: string, viewer: AuthUser) {
  const row = await loadOrderRow(orderId);
  if (!row || (row.buyerId !== viewer.id && row.sellerId !== viewer.id)) {
    throw notFound("Không tìm thấy đơn hàng này.");
  }
  return row;
}

/* ------------------------------------------------------------------ *
 * State machine (detail-project 11.1)
 * ------------------------------------------------------------------ */

/**
 * Conditional update on `id + version + status`; a miss is diagnosed so the
 * client learns whether the status or the version moved underneath it.
 */
async function conditionalTransition(
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

async function recordTransition(
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
  await tx.notification.create({
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

/** Returns a released listing to a buyable state, or hides it (11.1). */
async function releaseReservedProducts(
  tx: Prisma.TransactionClient,
  orderId: string,
  productIds: string[],
): Promise<void> {
  if (productIds.length === 0) return;
  const products = await tx.product.findMany({
    where: { id: { in: productIds } },
    include: { seller: true },
  });
  const categoryCache = new Map<string, boolean>();

  for (const product of products) {
    if (product.reservedOrderId !== orderId) continue;
    const sellable =
      product.deletedAt === null &&
      !product.isBlocked &&
      product.seller.status === "ACTIVE" &&
      product.seller.emailVerifiedAt !== null &&
      (await categoryChainActive(tx, product.categoryId, categoryCache));
    await tx.product.update({
      where: { id: product.id },
      data: {
        status: sellable ? "ACTIVE" : "INACTIVE",
        reservedOrderId: null,
        version: { increment: 1 },
      },
    });
  }
}

async function applyOrderAction(
  orderId: string,
  input: OrderActionInput,
  actor: AuthUser,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
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

        /* the reservation must still be intact (11.1) */
        const products = await tx.product.findMany({
          where: { id: { in: productIds } },
          include: { seller: true },
        });
        const categoryCache = new Map<string, boolean>();
        let reservationOk = products.length === productIds.length;
        for (const product of products) {
          const valid =
            product.status === "RESERVED" &&
            product.reservedOrderId === order.id &&
            !product.isBlocked &&
            product.deletedAt === null &&
            product.seller.status === "ACTIVE" &&
            product.seller.emailVerifiedAt !== null &&
            (await categoryChainActive(tx, product.categoryId, categoryCache));
          if (!valid) reservationOk = false;
        }
        if (!reservationOk) {
          throw new AppError(
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

        await conditionalTransition(tx, order, ["PENDING", "CONFIRMED"], input.expected_version, {
          status: "CANCELLED",
          cancelledAt: now,
          cancellationReason: reason,
          expiresAt: null,
        });
        await tx.order.update({
          where: { id: order.id },
          data: { cancelledById: actor.id },
        });
        await releaseReservedProducts(tx, order.id, productIds);
        await recordTransition(tx, order, actor, "CANCELLED", reason, {
          type: "ORDER_CANCELLED",
          title: "Đơn hàng đã bị hủy",
          content: `Đơn #${order.code} đã hủy. ${reason}`,
        });
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
}

/* ------------------------------------------------------------------ *
 * GET /api/v1/orders
 * ------------------------------------------------------------------ */

router.get(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const viewer = viewerOf(req);
    const query = orderListQuerySchema.parse(req.query);
    const paging = {
      page: query.page ?? 1,
      page_size: query.page_size ?? DEFAULT_PAGE_SIZE,
    };

    const where: Prisma.OrderWhereInput =
      query.role === "seller" ? { sellerId: viewer.id } : { buyerId: viewer.id };
    if (query.status !== undefined && query.status !== "ALL") {
      where.status = query.status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: { items: true, buyer: true, seller: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.order.count({ where }),
    ]);

    const rows: OrderRow[] = orders.map((order) => ({
      ...order,
      deliveryInfo: null,
      statusHistory: [],
      conversation: null,
    }));

    const counterpartyIds = rows.map((row) =>
      row.buyerId === viewer.id ? row.sellerId : row.buyerId,
    );
    const aggregates = await loadSellerAggregates(counterpartyIds);
    const items: OrderListItem[] = rows.map((row) => {
      const base = toOrderListItem(row, viewer.id);
      return { ...base, counterparty: counterpartySummary(base, row, aggregates) };
    });

    okList(res, items, pageMeta(paging, total));
  }),
);

/* ------------------------------------------------------------------ *
 * GET /api/v1/orders/:id
 * ------------------------------------------------------------------ */

router.get(
  "/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    const viewer = viewerOf(req);
    const orderId = parseId(req.params.id);

    const row = await loadOrderRow(orderId);
    if (!row) throw notFound("Không tìm thấy đơn hàng này.");
    const isParticipant = row.buyerId === viewer.id || row.sellerId === viewer.id;
    if (!isParticipant) {
      throw notFound("Không tìm thấy đơn hàng này.");
    }

    ok(res, await buildDetail(row, viewer));
  }),
);

/* ------------------------------------------------------------------ *
 * POST /api/v1/orders/:id/actions
 * ------------------------------------------------------------------ */

router.post(
  "/:id/actions",
  asyncHandler(async (req: AuthRequest, res) => {
    const viewer = viewerOf(req);
    const orderId = parseId(req.params.id);
    const body = orderActionSchema.parse(req.body);
    const { action, ...rest } = body;

    /* `support` and `chat` are navigation, not transitions: echo unchanged. */
    if (action === "support" || action === "chat") {
      const row = await loadParticipantOrder(orderId, viewer);
      ok(res, await buildDetail(row, viewer));
      return;
    }

    /* A LOCKED account keeps read + support access only (detail-project 6). */
    if (viewer.status === "LOCKED") throw accountLocked();

    if (action === "cancel") {
      const reason = rest.reason?.trim() ?? "";
      if (reason === "") {
        throw validationError("Vui lòng nhập lý do hủy đơn.", { reason: "Bắt buộc." });
      }
    }

    await applyOrderAction(orderId, { ...rest, action }, viewer);

    const row = await loadParticipantOrder(orderId, viewer);
    ok(res, await buildDetail(row, viewer));
  }),
);

/* ------------------------------------------------------------------ *
 * POST /api/v1/orders/:orderId/reviews
 * ------------------------------------------------------------------ */

router.post(
  "/:orderId/reviews",
  requireActive,
  requireVerified,
  asyncHandler(async (req: AuthRequest, res) => {
    const viewer = viewerOf(req);
    const orderId = parseId(req.params.orderId);
    const body = reviewSchema.parse(req.body);

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        buyer: true,
        items: { orderBy: { sortOrder: "asc" }, take: 1, select: { productId: true } },
      },
    });
    if (!order) throw notFound("Không tìm thấy đơn hàng này.");
    if (order.buyerId !== viewer.id && order.sellerId !== viewer.id) {
      throw notFound("Không tìm thấy đơn hàng này.");
    }
    if (order.buyerId !== viewer.id) {
      throw forbidden("Chỉ người mua được đánh giá đơn hàng.");
    }
    if (order.status !== "COMPLETED") {
      throw reviewNotAllowed("Chỉ đánh giá sau khi đơn hàng hoàn tất.");
    }
    const withinWindow =
      order.completedAt !== null &&
      Date.now() - order.completedAt.getTime() <= REVIEW_LIMITS.windowDays * DAY_MS;
    if (!withinWindow) {
      throw reviewNotAllowed(
        `Đã quá thời hạn đánh giá (${REVIEW_LIMITS.windowDays} ngày sau khi hoàn tất).`,
      );
    }

    const comment = body.comment?.trim() ?? "";
    if (comment !== "") {
      const message = validateReviewComment(comment);
      if (message) throw validationError(message, { comment: message });
    }

    const firstItem = order.items[0];
    if (!firstItem) {
      throw reviewNotAllowed("Đơn hàng không có sản phẩm nào để đánh giá.");
    }

    try {
      const review = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${viewer.id} FOR SHARE`;
        const liveViewer = await tx.user.findUnique({
          where: { id: viewer.id },
          select: { status: true, emailVerifiedAt: true },
        });
        if (!liveViewer || liveViewer.status !== "ACTIVE") throw accountLocked();
        if (liveViewer.emailVerifiedAt === null) {
          throw forbidden("Vui lòng xác minh email trước khi đánh giá.");
        }
        const created = await tx.review.create({
          data: {
            orderId: order.id,
            reviewerId: viewer.id,
            reviewedUserId: order.sellerId,
            productId: firstItem.productId,
            rating: body.rating,
            comment: comment === "" ? null : comment,
          },
        });
        await tx.notification.create({
          data: {
            userId: order.sellerId,
            type: "REVIEW_CREATED",
            title: "Bạn có đánh giá mới",
            content: `${viewer.fullName} đã đánh giá ${body.rating}/5 cho đơn #${order.code}.`,
            referenceType: "order",
            referenceId: order.id,
            dedupeKey: `order:${order.id}:REVIEW_CREATED`,
          },
        });
        await enqueueOutbox(tx, "notification.created", created.id, `review:${created.id}`, {
          recipient_id: order.sellerId,
          recipients: [order.sellerId],
          reference_type: "order",
          reference_id: order.id,
        });
        return created;
      });
      ok(res, toReview(review, order.buyer), 201);
    } catch (error) {
      /* `Review.orderId` is unique — a second attempt is simply not allowed. */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw reviewNotAllowed("Bạn đã đánh giá đơn hàng này.");
      }
      throw error;
    }
  }),
);

export { router as ordersRouter };
