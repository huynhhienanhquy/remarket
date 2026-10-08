import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { requireActive } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
import { notFound, unauthorized, validationError } from "../shared/errors.js";
import { offsetOf, pageMeta, parsePagingOnly } from "../shared/pagination.js";
import { toSavedProductListItem } from "../shared/dto-mappers.js";
import { buildProductContext, loadCategoryChain } from "../shared/viewer.js";

/**
 * Favourite routes (detail-project 9.4): list, idempotent add and remove.
 * Unavailable listings stay in the private list so the owner can remove them;
 * blocked and soft-deleted content is returned as a redacted placeholder.
 */

const NOT_FOUND_MESSAGE = "Không tìm thấy tin đăng này.";
const OWN_LISTING_MESSAGE = "Bạn không thể lưu tin đăng của chính mình.";
const VISIBLE_STATUSES = ["ACTIVE", "RESERVED", "SOLD"] as const;

const productIdSchema = z.object({
  productId: z.string({ required_error: "Mã sản phẩm không hợp lệ." }).min(1, "Mã sản phẩm không hợp lệ."),
});

function viewerIdOf(req: AuthRequest): string {
  if (!req.user) throw unauthorized("Bạn cần đăng nhập để tiếp tục.");
  return req.user.id;
}

export const favoritesRouter = Router();

// Marketplace mutations need an ACTIVE account (detail-project 6).
favoritesRouter.use(requireActive);

// GET /favorites — newest favourite first.
favoritesRouter.get(
  "/",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const viewerId = viewerIdOf(req);
    const paging = parsePagingOnly(req.query);
    const where = { userId: viewerId };

    const [total, rows] = await Promise.all([
      prisma.favorite.count({ where }),
      prisma.favorite.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offsetOf(paging),
        take: paging.page_size,
        include: {
          product: {
            include: { images: { orderBy: { sortOrder: "asc" } }, seller: true },
          },
        },
      }),
    ]);

    const products = rows.map((row) => row.product);
    const ctx = await buildProductContext(products, req);
    return okList(
      res,
      products.map((product) => toSavedProductListItem(product, ctx)),
      pageMeta(paging, total),
    );
  }),
);

// PUT /favorites/:productId — upsert, idempotent.
favoritesRouter.put(
  "/:productId",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const viewerId = viewerIdOf(req);
    const { productId } = productIdSchema.parse(req.params);

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { seller: { select: { status: true, emailVerifiedAt: true } } },
    });
    if (!product || product.deletedAt !== null) throw notFound(NOT_FOUND_MESSAGE);
    if (product.sellerId === viewerId) {
      throw validationError(OWN_LISTING_MESSAGE, { product_id: OWN_LISTING_MESSAGE });
    }
    const category = await loadCategoryChain(product.categoryId);
    if (
      product.isBlocked ||
      !(VISIBLE_STATUSES as readonly string[]).includes(product.status) ||
      product.seller.status !== "ACTIVE" ||
      product.seller.emailVerifiedAt === null ||
      !category.active ||
      !category.isLeaf
    ) {
      throw notFound(NOT_FOUND_MESSAGE);
    }

    await prisma.favorite.upsert({
      where: { userId_productId: { userId: viewerId, productId } },
      create: { userId: viewerId, productId },
      update: {},
    });

    return ok(res, { is_favorited: true });
  }),
);

// DELETE /favorites/:productId — remove if present, idempotent.
favoritesRouter.delete(
  "/:productId",
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const viewerId = viewerIdOf(req);
    const { productId } = productIdSchema.parse(req.params);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw notFound(NOT_FOUND_MESSAGE);

    await prisma.favorite.deleteMany({ where: { userId: viewerId, productId } });
    return ok(res, { is_favorited: false });
  }),
);
