import { loadCategoryEligibility } from "../services/category-policy.js";
import type { User } from "@prisma/client";
import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { provinceLabel } from "@remarket/shared";
import type { CartGroup, CartItemView, CartView } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireActive, requireVerified } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok } from "../shared/api-response.js";
import { notFound, productNotAvailable, unauthorized, validationError } from "../shared/errors.js";
import { toSellerSummary } from "../shared/dto-mappers.js";
import type { ProductRow } from "../shared/dto-mappers.js";
import { EMPTY_AGGREGATES, loadSellerAggregates } from "../shared/seller-aggregates.js";
import { createPublicStorageUrl } from "../services/storage.js";
import { usableImageUrl } from "../shared/image-url.js";

/**
 * Cart routes (detail-project 9.4): the view is grouped by seller and every
 * add/remove returns the whole `CartView` so the client can refresh its cache
 * in one round trip. Adds are idempotent — quantity stays 1 and a second POST
 * never duplicates the row.
 *
 * An item that is no longer purchasable keeps its identity but carries
 * `available: false` and a reason string for the UI.
 */

const NOT_FOUND_MESSAGE = "Không tìm thấy tin đăng này.";
const OWN_LISTING_MESSAGE = "Không thể mua món đồ của chính mình.";
const MAX_CART_ITEMS = 50;

const addCartItemSchema = z
  .object({
    product_id: z
      .string({ required_error: "Sản phẩm không hợp lệ.", invalid_type_error: "Sản phẩm không hợp lệ." })
      .min(1, "Sản phẩm không hợp lệ."),
  })
  .strict();

function viewerIdOf(req: AuthRequest): string {
  if (!req.user) throw unauthorized("Bạn cần đăng nhập để tiếp tục.");
  return req.user.id;
}

/** Why one listing cannot be checked out right now; null when it is buyable. */
function unavailableReason(
  product: ProductRow,
  viewerId: string,
  isValidCategory: (categoryId: string) => boolean,
): string | null {
  if (product.deletedAt !== null || product.isBlocked) return "Tin đăng không còn khả dụng.";
  if (product.sellerId === viewerId) return OWN_LISTING_MESSAGE;
  if (product.status !== "ACTIVE") {
    if (product.status === "RESERVED") return "Sản phẩm đang được giữ cho một giao dịch.";
    if (product.status === "SOLD") return "Sản phẩm đã bán.";
    return "Tin đăng không khả dụng để mua.";
  }
  if (product.seller.status !== "ACTIVE" || product.seller.emailVerifiedAt === null) {
    return "Người bán chưa đủ điều kiện giao dịch.";
  }
  if (!isValidCategory(product.categoryId)) return "Danh mục sản phẩm không còn hoạt động.";
  return null;
}

async function buildCartView(
  viewerId: string,
  isValidCategory?: (categoryId: string) => boolean,
): Promise<CartView> {
  const [validCategory, entries, totalItems] = await Promise.all([
    isValidCategory ? Promise.resolve(isValidCategory) : loadCategoryEligibility(prisma).then((ids) => (id: string) => ids.has(id)),
    prisma.cartItem.findMany({
      where: { userId: viewerId },
      orderBy: { createdAt: "desc" },
      take: MAX_CART_ITEMS,
      include: {
        product: { include: { images: { orderBy: { sortOrder: "asc" } }, seller: true } },
      },
    }),
    prisma.cartItem.count({ where: { userId: viewerId } }),
  ]);

  const sellers = new Map<string, User>();
  const itemsBySeller = new Map<string, CartItemView[]>();

  for (const entry of entries) {
    const product = entry.product;
    if (!sellers.has(product.sellerId)) sellers.set(product.sellerId, product.seller);

    const reason = unavailableReason(product, viewerId, validCategory);
    const hidden = product.deletedAt !== null || product.isBlocked;
    const image = product.images[0];
    const publicImage = !hidden && ["ACTIVE", "RESERVED", "SOLD"].includes(product.status)
      && product.seller.status === "ACTIVE" && product.seller.emailVerifiedAt !== null
      && validCategory(product.categoryId);
    const item: CartItemView = {
      delivery_method: product.deliveryMethod,
      shipping_fee: hidden ? "0" : product.shippingFee.toString(),
      product_id: product.id,
      title: hidden ? "" : product.title,
      price: hidden ? "0" : product.price.toString(),
      image_url: !publicImage || !image ? null : image.storagePath ? createPublicStorageUrl(image.storagePath) : usableImageUrl(image.url),
      condition: product.condition,
      status: product.status,
      province_label: provinceLabel(product.provinceCode),
      available: reason === null,
      unavailable_reason: reason,
    };

    const bucket = itemsBySeller.get(product.sellerId) ?? [];
    bucket.push(item);
    itemsBySeller.set(product.sellerId, bucket);
  }

  const aggregates = await loadSellerAggregates([...sellers.keys()]);
  const groups: CartGroup[] = [...sellers.entries()]
    .map(([sellerId, seller]) => ({
      seller: toSellerSummary(seller, aggregates.get(sellerId) ?? EMPTY_AGGREGATES),
      items: itemsBySeller.get(sellerId) ?? [],
    }))
    // Sellers are ordered by name so the checkout summary is stable.
    .sort((a, b) => a.seller.name.localeCompare(b.seller.name, "vi"));

  return { groups, total_items: totalItems };
}

export const cartRouter = Router();

// The account must be ACTIVE to shop (detail-project 6).
cartRouter.use(requireActive);

// GET /cart — grouped view, newest item first inside each seller.
cartRouter.get(
  "/",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const viewerId = viewerIdOf(req);
    return ok(res, await buildCartView(viewerId));
  }),
);

// POST /cart/items — idempotent add that returns the whole cart (9.4).
cartRouter.post(
  "/items",
  requireVerified,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const viewerId = viewerIdOf(req);
    const { product_id: productId } = addCartItemSchema.parse(req.body);

    const [product, validCategory] = await Promise.all([
      prisma.product.findUnique({
        where: { id: productId },
        include: { images: { orderBy: { sortOrder: "asc" } }, seller: true },
      }),
      loadCategoryEligibility(prisma).then((ids) => (id: string) => ids.has(id)),
    ]);
    if (!product || product.deletedAt !== null) throw notFound(NOT_FOUND_MESSAGE);

    if (product.sellerId === viewerId) {
      throw validationError(OWN_LISTING_MESSAGE, { product_id: OWN_LISTING_MESSAGE });
    }
    const reason = unavailableReason(product, viewerId, validCategory);
    if (reason !== null) throw productNotAvailable(reason);

    // Quantity is fixed at 1: adding twice must not duplicate or increment.
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${viewerId} FOR UPDATE`;
      const existing = await tx.cartItem.findUnique({ where: { userId_productId: { userId: viewerId, productId } } });
      if (existing) return;
      if (await tx.cartItem.count({ where: { userId: viewerId } }) >= MAX_CART_ITEMS) {
        throw validationError(`Giỏ hàng tối đa ${MAX_CART_ITEMS} món. Hãy bỏ bớt món trước khi thêm.`, { product_id: "Giỏ hàng đã đầy." });
      }
      await tx.cartItem.create({ data: { userId: viewerId, productId } });
    });

    return ok(res, await buildCartView(viewerId, validCategory));
  }),
);

// DELETE /cart/items/:productId — idempotent removal, returns the cart.
cartRouter.delete(
  "/items/:productId",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const viewerId = viewerIdOf(req);
    const productId = req.params.productId ?? "";
    if (productId === "") throw notFound(NOT_FOUND_MESSAGE);

    await prisma.cartItem.deleteMany({ where: { userId: viewerId, productId } });
    return ok(res, await buildCartView(viewerId));
  }),
);
