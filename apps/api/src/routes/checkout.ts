import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { API_ERROR_CODES } from "@remarket/shared";
import type { CheckoutResult, OrderListItem } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler, AppError } from "../middleware/errorHandler.js";
import { requireVerified } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok } from "../shared/api-response.js";
import {
  idempotencyConflict,
  priceChanged,
  retryLater,
  unauthorized,
  validationError,
} from "../shared/errors.js";
import { toOrderListItem, toSellerSummary } from "../shared/dto-mappers.js";
import type { OrderRow } from "../shared/dto-mappers.js";
import { EMPTY_AGGREGATES, loadSellerAggregates } from "../shared/seller-aggregates.js";
import { enqueueOutbox } from "../outbox/outbox.js";
import { checkoutRateLimit } from "../middleware/rate-limit.js";
import type { SellerAggregates } from "../shared/seller-aggregates.js";
import { cmpMoney, sumMoney } from "../shared/money.js";
import { env } from "../config/env.js";

/**
 * POST /checkout — the transactional core (detail-project 10).
 *
 * The whole purchase runs inside one Serializable transaction: idempotency
 * find-or-create, validation, price/shipping comparison, one order per seller
 * with snapshots, conditional reservation of every product, cart cleanup,
 * seller notifications and the `SUCCEEDED` marker. Any failure rolls the whole
 * basket back, so a multi-seller checkout can never be half applied and money
 * always comes from the database — never from the client.
 */

const router = Router();

const MAX_ORDER_TTL_MS = env.orderConfirmTimeoutHours * 60 * 60 * 1000;
const MAX_CHECKOUT_ITEMS = 50;
const MAX_IDEMPOTENCY_KEY_LENGTH = 128;
const ORDER_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/* ------------------------------------------------------------------ *
 * Input (zod strict, trimmed — detail-project 4)
 * ------------------------------------------------------------------ */

const checkoutItemSchema = z
  .object({
    product_id: z.string().uuid("Mã sản phẩm không hợp lệ."),
    expected_price: z.string().regex(/^\d+$/, "Giá phải là số nguyên VND."),
  })
  .strict();

const checkoutDeliverySchema = z
  .object({
    seller_id: z.string().uuid("Mã người bán không hợp lệ."),
    method: z.enum(["COD", "MEETUP"]),
    recipient_name: z
      .string()
      .trim()
      .min(1, "Tên người nhận không được để trống.")
      .max(100, "Tên người nhận tối đa 100 ký tự."),
    recipient_phone: z.string().trim().regex(/^\d{9,11}$/, "Số điện thoại gồm 9–11 chữ số."),
    delivery_address: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập địa chỉ nhận hàng hoặc địa điểm gặp.")
      .max(300, "Địa chỉ tối đa 300 ký tự."),
    expected_shipping_fee: z.string().regex(/^\d+$/, "Phí vận chuyển phải là số nguyên VND."),
  })
  .strict();

const checkoutPayloadSchema = z
  .object({
    items: z
      .array(checkoutItemSchema)
      .min(1, "Chưa chọn sản phẩm để đặt hàng.")
      .max(MAX_CHECKOUT_ITEMS, `Tối đa ${MAX_CHECKOUT_ITEMS} sản phẩm mỗi đơn.`),
    deliveries: z
      .array(checkoutDeliverySchema)
      .min(1, "Thiếu thông tin giao nhận.")
      .max(MAX_CHECKOUT_ITEMS, `Tối đa ${MAX_CHECKOUT_ITEMS} thông tin giao nhận.`),
  })
  .strict();

type CheckoutItemInput = z.infer<typeof checkoutItemSchema>;
type CheckoutDeliveryInput = z.infer<typeof checkoutDeliverySchema>;
type CheckoutPayloadInput = z.infer<typeof checkoutPayloadSchema>;

/* ------------------------------------------------------------------ *
 * Canonical payload (detail-project 10.1)
 * ------------------------------------------------------------------ */

function byIdAsc(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

interface NormalizedPayload {
  items: CheckoutItemInput[];
  deliveries: CheckoutDeliveryInput[];
  hash: string;
}

/**
 * Sorts items by `product_id` and deliveries by `seller_id`, rejects duplicates
 * and hashes the canonical JSON with SHA-256 — the same payload retried under
 * the same idempotency key always produces the same hash.
 */
export function normalizePayload(payload: CheckoutPayloadInput): NormalizedPayload {
  const items = [...payload.items].sort((a, b) => byIdAsc(a.product_id, b.product_id));
  for (let index = 1; index < items.length; index += 1) {
    if (items[index]!.product_id === items[index - 1]!.product_id) {
      throw validationError("Có sản phẩm bị lặp trong giỏ hàng.", {
        items: "Mỗi sản phẩm chỉ xuất hiện một lần.",
      });
    }
  }

  const deliveries = [...payload.deliveries].sort((a, b) => byIdAsc(a.seller_id, b.seller_id));
  for (let index = 1; index < deliveries.length; index += 1) {
    if (deliveries[index]!.seller_id === deliveries[index - 1]!.seller_id) {
      throw validationError("Mỗi người bán chỉ cần một thông tin giao nhận.", {
        deliveries: "Trùng người bán.",
      });
    }
  }

  const canonical = JSON.stringify({
    items: items.map((item) => ({
      product_id: item.product_id,
      expected_price: item.expected_price,
    })),
    deliveries: deliveries.map((delivery) => ({
      seller_id: delivery.seller_id,
      method: delivery.method,
      recipient_name: delivery.recipient_name,
      recipient_phone: delivery.recipient_phone,
      delivery_address: delivery.delivery_address,
      expected_shipping_fee: delivery.expected_shipping_fee,
    })),
  });

  return {
    items,
    deliveries,
    hash: createHash("sha256").update(canonical, "utf8").digest("hex"),
  };
}

/** Header wins; the query param is the transitional fallback (detail-project 2). */
const checkoutQuerySchema = z
  .object({ idempotency_key: z.string().max(MAX_IDEMPOTENCY_KEY_LENGTH).optional() })
  .strict();

function readIdempotencyKey(req: AuthRequest): string {
  const query = checkoutQuerySchema.parse(req.query);
  const header = req.headers["idempotency-key"];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  const fromQuery = query.idempotency_key ?? "";
  const key = (fromHeader ?? fromQuery).trim();
  if (key === "") {
    throw validationError("Thiếu mã idempotency cho yêu cầu đặt hàng.", {
      idempotency_key: "Bắt buộc.",
    });
  }
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw validationError("Mã idempotency quá dài.", {
      idempotency_key: `Tối đa ${MAX_IDEMPOTENCY_KEY_LENGTH} ký tự.`,
    });
  }
  return key;
}

/* ------------------------------------------------------------------ *
 * Small private helpers
 * ------------------------------------------------------------------ */

/** Leaf and every ancestor must be ACTIVE (detail-project 9.1), per transaction. */
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

function newOrderCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += ORDER_CODE_ALPHABET[bytes[index]! % ORDER_CODE_ALPHABET.length];
  }
  return `RM-${code}`;
}

/** `RM-XXXXXXXX` is unique; collisions are astronomically rare but never assumed. */
async function uniqueOrderCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = newOrderCode();
    const taken = await tx.order.findUnique({ where: { code }, select: { id: true } });
    if (!taken) return code;
  }
  throw retryLater("Không tạo được mã đơn hàng, vui lòng thử lại.");
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002" || error.code === "P2028" || error.code === "P2034";
  }
  if (error instanceof Error) {
    return /could not serialize access|write conflict|deadlock/i.test(error.message);
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Transaction (detail-project 10.2)
 * ------------------------------------------------------------------ */

interface CheckoutOutcome {
  checkoutRequestId: string;
  rows: OrderRow[];
}

async function runCheckout(
  buyerId: string,
  idempotencyKey: string,
  requestHash: string,
  payload: NormalizedPayload,
): Promise<CheckoutOutcome> {
  const { items, deliveries } = payload;

  const outcome = await prisma.$transaction(
    async (tx) => {
      /* 1. find-or-create the idempotency record */
      const existing = await tx.checkoutRequest.findUnique({
        where: { userId_idempotencyKey: { userId: buyerId, idempotencyKey } },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) throw idempotencyConflict();
        if (existing.status !== "SUCCEEDED") {
          throw retryLater("Yêu cầu đặt hàng đang được xử lý, vui lòng thử lại.");
        }
        /* 2. replay: return exactly the orders created by the first attempt */
        const orders = await tx.order.findMany({
          where: { checkoutRequestId: existing.id },
          include: { items: true, buyer: true, seller: true, deliveryInfo: true, statusHistory: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        });
        return {
          checkoutRequestId: existing.id,
          rows: orders.map((order) => ({ ...order, conversation: null })),
        };
      }

      const checkoutRequest = await tx.checkoutRequest.create({
        data: { userId: buyerId, idempotencyKey, requestHash },
      });

      /* 3. buyer + every product, in a stable UUID order */
      let buyer = await tx.user.findUnique({ where: { id: buyerId } });
      if (!buyer) throw unauthorized("Không tìm thấy tài khoản người mua.");

      const productIds = items.map((item) => item.product_id);
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
        include: { seller: true, images: { orderBy: { sortOrder: "asc" } } },
        orderBy: { id: "asc" },
      });
      const byId = new Map(products.map((product) => [product.id, product]));

      const missing = productIds.filter((productId) => !byId.has(productId));
      if (missing.length > 0) {
        throw new AppError(
          API_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
          "Một số sản phẩm không tồn tại hoặc đã bị gỡ.",
          409,
          { product_ids: missing },
        );
      }

      /* 4. never allow a self-purchase */
      for (const product of products) {
        if (product.sellerId === buyerId) {
          throw validationError("Bạn không thể mua sản phẩm của chính mình.", {
            items: "Một sản phẩm thuộc tài khoản của bạn.",
          });
        }
      }

      // Serialize checkout with admin account locking. If checkout owns these
      // row locks first, the lock orchestration will see and cancel the new
      // order; if admin owns them first, the fresh status check below aborts.
      const participantIds = [...new Set([buyerId, ...products.map((product) => product.sellerId)])]
        .sort(byIdAsc);
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(participantIds)}) ORDER BY "id" FOR UPDATE`,
      );
      const participants = await tx.user.findMany({ where: { id: { in: participantIds } } });
      const usersById = new Map(participants.map((user) => [user.id, user]));
      buyer = usersById.get(buyerId) ?? null;
      if (!buyer || buyer.status !== "ACTIVE" || buyer.emailVerifiedAt === null) {
        throw unauthorized("Tài khoản người mua không còn đủ điều kiện đặt hàng.");
      }
      const categoryIds = [...new Set(products.map((product) => product.categoryId))];
      await tx.$queryRaw(
        Prisma.sql`
          WITH RECURSIVE chain AS (
            SELECT "id", "parentId" FROM "Category"
            WHERE "id" IN (${Prisma.join(categoryIds)})
            UNION
            SELECT parent."id", parent."parentId"
            FROM "Category" parent
            JOIN chain child ON parent."id" = child."parentId"
          )
          SELECT category."id"
          FROM "Category" category
          WHERE category."id" IN (SELECT "id" FROM chain)
          ORDER BY category."id"
          FOR SHARE
        `,
      );

      /* 5. publicly purchasable: product, seller and category chain all valid */
      const categoryCache = new Map<string, boolean>();
      const unavailable: string[] = [];
      for (const product of products) {
        const seller = usersById.get(product.sellerId);
        const sellerOk = seller?.status === "ACTIVE" && seller.emailVerifiedAt !== null;
        const categoryOk = await categoryChainActive(tx, product.categoryId, categoryCache);
        if (
          product.status !== "ACTIVE" ||
          product.deletedAt !== null ||
          product.isBlocked ||
          !sellerOk ||
          !categoryOk
        ) {
          unavailable.push(product.id);
        }
      }
      if (unavailable.length > 0) {
        throw new AppError(
          API_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
          "Sản phẩm không còn khả dụng để mua.",
          409,
          { product_ids: unavailable },
        );
      }

      /* 6. collect EVERY price change before creating anything */
      const priceChanges: Array<{ product_id: string; price: string }> = [];
      for (const item of items) {
        const product = byId.get(item.product_id)!;
        const current = product.price.toString();
        if (cmpMoney(current, item.expected_price) !== 0) {
          priceChanges.push({ product_id: product.id, price: current });
        }
      }
      if (priceChanges.length > 0) {
        throw priceChanged("Giá của món đồ vừa thay đổi, vui lòng xác nhận lại.", {
          items: priceChanges,
        });
      }

      /* 7. sellers are derived from the products, deliveries must match exactly */
      const itemsBySeller = new Map<string, CheckoutItemInput[]>();
      for (const item of items) {
        const product = byId.get(item.product_id)!;
        const bucket = itemsBySeller.get(product.sellerId) ?? [];
        bucket.push(item);
        itemsBySeller.set(product.sellerId, bucket);
      }
      const deliveriesBySeller = new Map(deliveries.map((entry) => [entry.seller_id, entry]));
      const derivedSellerIds = [...itemsBySeller.keys()].sort(byIdAsc);
      const deliverySellerIds = [...deliveriesBySeller.keys()].sort(byIdAsc);
      const deliveriesMatch =
        derivedSellerIds.length === deliverySellerIds.length &&
        derivedSellerIds.every((sellerId, index) => deliverySellerIds[index] === sellerId);
      if (!deliveriesMatch) {
        throw validationError("Thông tin giao nhận chưa khớp với nhóm người bán đã chọn.", {
          deliveries: "Thiếu hoặc thừa thông tin giao nhận.",
        });
      }

      /* 8. every item must support the chosen delivery method */
      for (const [sellerId, group] of itemsBySeller) {
        const delivery = deliveriesBySeller.get(sellerId)!;
        for (const item of group) {
          const product = byId.get(item.product_id)!;
          const supported =
            product.deliveryMethod === "BOTH" || product.deliveryMethod === delivery.method;
          if (!supported) {
            throw validationError(
              "Các món này chưa có hình thức giao nhận chung. Vui lòng điều chỉnh sản phẩm.",
              { deliveries: "Hình thức giao nhận không phù hợp với sản phẩm." },
            );
          }
        }
      }

      /* 9. shipping: COD -> max(product.shippingFee), MEETUP -> 0, then compare */
      const shippingBySeller = new Map<string, string>();
      const shippingMismatches: Array<{
        seller_id: string;
        expected_shipping_fee: string;
        shipping_fee: string;
      }> = [];
      for (const [sellerId, group] of itemsBySeller) {
        const delivery = deliveriesBySeller.get(sellerId)!;
        let fee = "0";
        if (delivery.method !== "MEETUP") {
          fee = group.reduce((max, item) => {
            const value = byId.get(item.product_id)!.shippingFee.toString();
            return BigInt(value) > BigInt(max) ? value : max;
          }, "0");
        }
        shippingBySeller.set(sellerId, fee);
        if (cmpMoney(fee, delivery.expected_shipping_fee) !== 0) {
          shippingMismatches.push({
            seller_id: sellerId,
            expected_shipping_fee: delivery.expected_shipping_fee,
            shipping_fee: fee,
          });
        }
      }
      if (shippingMismatches.length > 0) {
        throw priceChanged("Phí vận chuyển đã thay đổi, vui lòng xác nhận lại.", {
          sellers: shippingMismatches,
        });
      }

      /* 10. one PENDING order per seller, with snapshots taken from the DB */
      const now = new Date();
      const expiresAt = new Date(now.getTime() + MAX_ORDER_TTL_MS);
      const rows: OrderRow[] = [];

      for (const sellerId of derivedSellerIds) {
        const group = itemsBySeller.get(sellerId)!;
        const delivery = deliveriesBySeller.get(sellerId)!;
        const sellerProducts = group.map((item) => byId.get(item.product_id)!);
        const sellerUser = usersById.get(sellerId)!;
        const subtotal = sumMoney(sellerProducts.map((product) => product.price.toString()));
        const shippingFee = shippingBySeller.get(sellerId)!;
        const total = sumMoney([subtotal, shippingFee]);
        const code = await uniqueOrderCode(tx);

        const order = await tx.order.create({
          data: {
            code,
            buyerId,
            sellerId,
            status: "PENDING",
            deliveryMethod: delivery.method,
            subtotal,
            shippingFee,
            totalAmount: total,
            expiresAt,
            checkoutRequestId: checkoutRequest.id,
            items: {
              create: sellerProducts.map((product, index) => ({
                productId: product.id,
                titleSnapshot: product.title,
                conditionSnapshot: product.condition,
                imagePathSnapshot: product.images[0]?.storagePath ?? null,
                imageUrl: product.images[0]?.url ?? null,
                price: product.price.toString(),
                sortOrder: index,
              })),
            },
            deliveryInfo: {
              create: {
                method: delivery.method,
                recipientName: delivery.recipient_name,
                recipientPhone: delivery.recipient_phone,
                deliveryAddress: delivery.delivery_address,
              },
            },
            statusHistory: {
              create: {
                fromStatus: null,
                toStatus: "PENDING",
                actorType: "USER",
                actorId: buyer.id,
                actorName: buyer.fullName,
                reason: null,
              },
            },
          },
          include: { items: true, deliveryInfo: true, statusHistory: true },
        });

        /* 11./12. conditional hold: exactly one winner, or the whole tx aborts */
        for (const product of sellerProducts) {
          const held = await tx.product.updateMany({
            where: {
              id: product.id,
              status: "ACTIVE",
              version: product.version,
              reservedOrderId: null,
              deletedAt: null,
              isBlocked: false,
            },
            data: {
              status: "RESERVED",
              reservedOrderId: order.id,
              version: { increment: 1 },
            },
          });
          if (held.count !== 1) {
            throw new AppError(
              API_ERROR_CODES.PRODUCT_NOT_AVAILABLE,
              "Sản phẩm không còn khả dụng để giữ hàng.",
              409,
              { product_ids: [product.id] },
            );
          }
        }

        /* 14. one durable notification per seller */
        await tx.notification.create({
          data: {
            userId: sellerId,
            type: "ORDER_CREATED",
            title: "Có đơn hàng mới",
            content: `${buyer.fullName} vừa đặt ${sellerProducts.length} món hàng, chờ bạn xác nhận.`,
            referenceType: "order",
            referenceId: order.id,
            dedupeKey: `order:${order.id}:ORDER_CREATED`,
          },
        });
        await enqueueOutbox(tx, "order.updated", order.id, `order:${order.id}:created`, {
          order_id: order.id,
          status: "PENDING",
          recipients: [buyerId, sellerId],
        });

        rows.push({ ...order, buyer, seller: sellerUser, conversation: null });
      }

      /* 13. only the buyer's cart rows for these products disappear */
      await tx.cartItem.deleteMany({
        where: { userId: buyerId, productId: { in: productIds } },
      });

      /* 15. commit marker */
      await tx.checkoutRequest.update({
        where: { id: checkoutRequest.id },
        data: { status: "SUCCEEDED" },
      });

      return { checkoutRequestId: checkoutRequest.id, rows };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 15000,
    },
  );

  return outcome;
}

/** Serializable conflicts and unique races get exactly one retry (detail-project 10.2). */
async function runCheckoutWithRetry(
  buyerId: string,
  idempotencyKey: string,
  requestHash: string,
  payload: NormalizedPayload,
): Promise<CheckoutOutcome> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await runCheckout(buyerId, idempotencyKey, requestHash, payload);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (!isRetryableError(error)) throw error;
      if (attempt === 2) throw retryLater();
    }
  }
  throw retryLater();
}

function toCheckoutOrders(
  rows: OrderRow[],
  aggregates: ReadonlyMap<string, SellerAggregates>,
): OrderListItem[] {
  return rows.map((row) => {
    const base = toOrderListItem(row, row.buyerId);
    return {
      ...base,
      counterparty: toSellerSummary(row.seller, aggregates.get(row.sellerId) ?? EMPTY_AGGREGATES),
    };
  });
}

/* ------------------------------------------------------------------ *
 * POST /api/v1/checkout
 * ------------------------------------------------------------------ */

router.post(
  "/",
  checkoutRateLimit,
  requireVerified,
  asyncHandler(async (req: AuthRequest, res) => {
    if (!req.user) throw unauthorized();
    const buyerId = req.user.id;

    const idempotencyKey = readIdempotencyKey(req);
    const payload = checkoutPayloadSchema.parse(req.body);
    const normalized = normalizePayload(payload);

    const outcome = await runCheckoutWithRetry(
      buyerId,
      idempotencyKey,
      normalized.hash,
      normalized,
    );

    const aggregates = await loadSellerAggregates(outcome.rows.map((row) => row.sellerId));
    const data: CheckoutResult = {
      checkout_request_id: outcome.checkoutRequestId,
      orders: toCheckoutOrders(outcome.rows, aggregates),
    };
    ok(res, data, 201);
  }),
);

export { router as checkoutRouter };
