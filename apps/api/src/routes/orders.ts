import { Prisma } from "@prisma/client";
import type { OrderDetail, OrderListItem } from "@remarket/shared";
import { REVIEW_LIMITS, validateReviewComment } from "@remarket/shared";
import { Router } from "express";
import { z } from "zod";
import type { AuthRequest, AuthUser } from "../middleware/auth.js";
import { requireActive, requireVerified } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { createNotification } from "../services/notifications.js";
import { DAY_MS, applyOrderAction, hasOpenOrderTicket } from "../services/order-actions.js";
import { ok, okList } from "../shared/api-response.js";
import type { OrderRow } from "../shared/dto-mappers.js";
import {
  completionBlockReason,
  toOrderDetail,
  toOrderListItem,
  toReview,
  toSellerSummary,
} from "../shared/dto-mappers.js";
import {
  accountLocked,
  forbidden,
  notFound,
  reviewNotAllowed,
  unauthorized,
  validationError
} from "../shared/errors.js";
import { DEFAULT_PAGE_SIZE, offsetOf, pageMeta } from "../shared/pagination.js";
import type { SellerAggregates } from "../shared/seller-aggregates.js";
import { EMPTY_AGGREGATES, loadSellerAggregates } from "../shared/seller-aggregates.js";
import { prisma } from "../utils/prisma.js";

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
        await createNotification(tx, {
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
