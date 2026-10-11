import { Prisma } from "@prisma/client";
import { API_ERROR_CODES, orderShippingFee } from "@remarket/shared";
import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { enqueueOutbox } from "../outbox/outbox.js";
import { loadCategoryEligibility } from "../services/category-policy.js";
import { byIdAsc, type CheckoutItemInput, type NormalizedPayload } from "../services/checkout-input.js";
import { createNotification } from "../services/notifications.js";
import { isTransactionConflict } from "../shared/database-errors.js";
import type { OrderRow } from "../shared/dto-mappers.js";
import { idempotencyConflict, priceChanged, retryLater, unauthorized, validationError } from "../shared/errors.js";
import { cmpMoney, sumMoney } from "../shared/money.js";
import { prisma } from "../utils/prisma.js";

export const MAX_ORDER_TTL_MS = env.orderConfirmTimeoutHours * 60 * 60 * 1000;

export const ORDER_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function newOrderCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (let index = 0; index < 8; index += 1) {
    code += ORDER_CODE_ALPHABET[bytes[index]! % ORDER_CODE_ALPHABET.length];
  }
  return `RM-${code}`;
}

export async function uniqueOrderCode(tx: Prisma.TransactionClient): Promise<string> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const code = newOrderCode();
    const taken = await tx.order.findUnique({ where: { code }, select: { id: true } });
    if (!taken) return code;
  }
  throw retryLater("Không tạo được mã đơn hàng, vui lòng thử lại.");
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === "P2002" || error.code === "P2028" || isTransactionConflict(error);
  }
  if (error instanceof Error) {
    return /could not serialize access|write conflict|deadlock/i.test(error.message);
  }
  return false;
}

export interface CheckoutOutcome {
  checkoutRequestId: string;
  rows: OrderRow[];
}

export async function runCheckout(
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
      await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Product" WHERE "id" IN (${Prisma.join(productIds)}) ORDER BY "id" FOR UPDATE`);
      /* 5. publicly purchasable: product, seller and category chain all valid */
      const eligibleCategories = await loadCategoryEligibility(tx, [...new Set(products.map((product) => product.categoryId))], true);
      const unavailable: string[] = [];
      for (const product of products) {
        const seller = usersById.get(product.sellerId);
        const sellerOk = seller?.status === "ACTIVE" && seller.emailVerifiedAt !== null;
        const categoryOk = eligibleCategories.has(product.categoryId);
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
        const fee = orderShippingFee(delivery.method, group.map((item) => byId.get(item.product_id)!.shippingFee.toString()));
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
        await createNotification(tx, {
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
    },
  );

  return outcome;
}

export async function runCheckoutWithRetry(
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
