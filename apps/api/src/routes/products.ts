import { Prisma, type Product } from "@prisma/client";
import {
  CONDITIONS,
  DELIVERY_METHODS,
  PRODUCT_STATUSES,
  SORT_OPTIONS,
  normalizePriceFilter
} from "@remarket/shared";
import type { Response } from "express";
import { Router } from "express";
import type { AuthRequest } from "../middleware/auth.js";
import { authMiddleware, optionalAuth, requireActive, requireVerified } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { eligibleCategoryIds, loadCategoryEligibility } from "../services/category-policy.js";
import { claimUploads, detachUnusedUploads, lockEligibleUploads } from "../services/product-assets.js";
import type { CreatePayload, PatchPayload } from "../services/product-input.js";
import { assertEnumValue, createSchema, ownListQuerySchema, patchSchema, searchQuerySchema, validateAndNormalize } from "../services/product-input.js";
import { ok, okList } from "../shared/api-response.js";
import type { ProductRow } from "../shared/dto-mappers.js";
import { isOwnerOrAdmin, toOwnProduct, toProductDetail } from "../shared/dto-mappers.js";
import {
  accountLocked,
  emailNotVerified,
  forbidden,
  invalidTransition,
  notFound,
  unauthorized,
  validationError,
  versionConflict,
} from "../shared/errors.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";
import { searchPublicProducts } from "../shared/product-search.js";
import { buildProductContext, loadCategoryChain, viewerFrom } from "../shared/viewer.js";
import { prisma } from "../utils/prisma.js";

/**
 * Product routes (detail-project 9): public search and detail, owner-only
 * mutations following the 9.3 state machine, plus the `/account/products`
 * listing of one's own rows (blocked and soft-deleted included).
 *
 * `app.ts` mounts `productsRouter` at `/products` and a dedicated read-only
 * `accountProductsRouter` at `/account/products` so undocumented mutation
 * aliases cannot leak under the account route.
 *
 * Validation messages match the product form and shared API contract.
 */

const NOT_FOUND_MESSAGE = "Không tìm thấy tin đăng này.";
const BUYABLE_STATUSES = ["ACTIVE", "RESERVED", "SOLD"] as const;

const MISSING_VIEWER = "Bạn cần đăng nhập để tiếp tục.";

function viewerIdOf(req: AuthRequest): string {
  if (!req.user) throw unauthorized(MISSING_VIEWER);
  return req.user.id;
}

/** Own listings stay behind an ACTIVE account. */
function activeViewerIdOf(req: AuthRequest): string {
  const viewerId = viewerIdOf(req);
  if (req.user?.status !== "ACTIVE") throw accountLocked();
  return viewerId;
}

/* ------------------------------------------------------------------ *
 * Input schemas (zod strict, no mass assignment)
 * ------------------------------------------------------------------ */

function imageCreateMany(images: readonly { url: string; storagePath: string; sortOrder: number }[]) {
  return images.map((image) => ({
    url: image.url,
    storagePath: image.storagePath,
    sortOrder: image.sortOrder,
  }));
}

async function assertCategoryEligibleInTransaction(tx: Prisma.TransactionClient, categoryId: string): Promise<void> {
  if (!(await loadCategoryEligibility(tx, [categoryId], true)).has(categoryId)) {
    throw validationError("Thông tin món đồ chưa hợp lệ.", { category_id: "Chỉ chọn danh mục cấp cuối còn hoạt động." });
  }
}

async function assertSellerEligibleInTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  requireEmailVerification: boolean,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR SHARE`;
  const seller = await tx.user.findUnique({
    where: { id: userId },
    select: { status: true, emailVerifiedAt: true },
  });
  if (!seller || seller.status !== "ACTIVE") throw accountLocked();
  if (requireEmailVerification && seller.emailVerifiedAt === null) {
    throw emailNotVerified("Vui lòng xác minh email để đăng tin.");
  }
}

const PRODUCT_INCLUDE = {
  images: { orderBy: { sortOrder: "asc" as const } },
  seller: true,
} as const;

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

/** Owner-only fetch: another user's (or deleted) listing is a 404 (9.1). */
async function loadOwnedProduct(req: AuthRequest): Promise<Product> {
  const viewerId = viewerIdOf(req);
  const productId = req.params.id ?? "";
  if (productId === "") throw notFound(NOT_FOUND_MESSAGE);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product || product.sellerId !== viewerId || product.deletedAt !== null) {
    throw notFound(NOT_FOUND_MESSAGE);
  }
  return product;
}

async function respondWithDetail(
  row: ProductRow,
  req: AuthRequest,
  res: Response,
  status = 200,
): Promise<Response> {
  const [ctx, chain] = await Promise.all([
    buildProductContext([row], req),
    loadCategoryChain(row.categoryId),
  ]);
  return ok(res, toProductDetail(row, ctx, chain.path, chain.active), status);
}

/** Batched category projection for a page of own listings (no N+1). */
async function loadCategoryIndex(): Promise<{
  path(categoryId: string): string[];
  active(categoryId: string): boolean;
}> {
  const rows = await prisma.category.findMany({
    select: { id: true, parentId: true, name: true, status: true },
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pathCache = new Map<string, string[]>();

  const path = (categoryId: string): string[] => {
    const cached = pathCache.get(categoryId);
    if (cached) return cached;
    const leaf = byId.get(categoryId);
    if (!leaf) return [];
    const names: string[] = [];
    const guard = new Set<string>();
    let cursor: (typeof rows)[number] | undefined = leaf;
    while (cursor && !guard.has(cursor.id)) {
      guard.add(cursor.id);
      names.unshift(cursor.name);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    pathCache.set(categoryId, names);
    return names;
  };

  const parents = new Set(rows.flatMap((row) => row.parentId ? [row.parentId] : []));
  const eligible = eligibleCategoryIds(rows.map((row) => ({ ...row, isLeaf: !parents.has(row.id) })));
  const active = (categoryId: string) => eligible.has(categoryId);

  return { path, active };
}

/* ------------------------------------------------------------------ *
 * GET /products — public search (detail-project 9.2)
 * ------------------------------------------------------------------ */

async function searchProducts(req: AuthRequest, res: Response): Promise<Response> {
  const parsed = searchQuerySchema.parse(req.query);
  const paging = parsePaging(req.query);

  const sort =
    parsed.sort !== undefined
      ? assertEnumValue(parsed.sort, SORT_OPTIONS, "sort", "Sắp xếp không hợp lệ.")
      : "newest";
  const condition =
    parsed.condition !== undefined
      ? assertEnumValue(
        parsed.condition,
        CONDITIONS,
        "condition",
        "Tình trạng món đồ không hợp lệ.",
      )
      : undefined;
  const deliveryMethod =
    parsed.delivery_method !== undefined
      ? assertEnumValue(
        parsed.delivery_method,
        DELIVERY_METHODS,
        "delivery_method",
        "Hình thức giao nhận không hợp lệ.",
      )
      : undefined;

  const priceRange = normalizePriceFilter(parsed.min_price ?? "", parsed.max_price ?? "");
  if (priceRange.error) throw validationError(priceRange.error, { price: priceRange.error });

  const result = await searchPublicProducts({
    keyword: (parsed.q ?? "").trim(), categoryId: parsed.category_id,
    condition, provinceCode: parsed.province_code, deliveryMethod,
    minPrice: priceRange.min, maxPrice: priceRange.max, sort,
    offset: offsetOf(paging), limit: paging.page_size,
  }, viewerFrom(req));
  return okList(res, result.items, pageMeta(paging, result.total));
}

/* ------------------------------------------------------------------ *
 * GET /products/:id — public detail (detail-project 9.1)
 * ------------------------------------------------------------------ */

async function getProductDetail(req: AuthRequest, res: Response): Promise<Response> {
  const productId = req.params.id ?? "";
  if (productId === "") throw notFound(NOT_FOUND_MESSAGE);

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: PRODUCT_INCLUDE,
  });
  if (!product || product.deletedAt !== null) throw notFound(NOT_FOUND_MESSAGE);

  const [ctx, chain] = await Promise.all([buildProductContext([product], req), loadCategoryChain(product.categoryId)]);
  if (!isOwnerOrAdmin(product, ctx)) {
    const visible =
      !product.isBlocked &&
      (BUYABLE_STATUSES as readonly string[]).includes(product.status) &&
      product.seller.status === "ACTIVE" &&
      product.seller.emailVerifiedAt !== null &&
      chain.active &&
      chain.isLeaf;
    if (!visible) throw notFound("Tin đăng không còn khả dụng.");
  }

  return ok(res, toProductDetail(product, ctx, chain.path, chain.active));
}

/* ------------------------------------------------------------------ *
 * POST /products — create (9.3: PENDING, version 1)
 * ------------------------------------------------------------------ */

async function createProduct(req: AuthRequest, res: Response): Promise<Response> {
  const payload: CreatePayload = createSchema.parse(req.body);
  const viewerId = viewerIdOf(req);
  const normalized = await validateAndNormalize(payload, payload.images);

  const created = await prisma.$transaction(async (tx) => {
    const productId = crypto.randomUUID();
    await assertSellerEligibleInTransaction(tx, viewerId, true);
    await assertCategoryEligibleInTransaction(tx, normalized.categoryId);
    const assetIds = await lockEligibleUploads(tx, viewerId, productId, normalized.images);
    // UploadAsset.productId has an immediate FK: create the referenced row
    // before claiming uploads, within the same rollback-safe transaction.
    const product = await tx.product.create({
      data: {
        id: productId,
        title: normalized.title,
        description: normalized.description,
        price: normalized.price,
        condition: normalized.condition,
        usageMonths: normalized.usageMonths,
        categoryId: normalized.categoryId,
        provinceCode: normalized.provinceCode,
        deliveryMethod: normalized.deliveryMethod,
        shippingFee: normalized.shippingFee,
        sellerId: viewerId,
        status: "PENDING",
        version: 1,
        images: { create: imageCreateMany(normalized.images) },
      },
      include: PRODUCT_INCLUDE,
    });
    await tx.uploadAsset.updateMany({ where: { id: { in: assetIds } }, data: { productId, attachedAt: new Date() } });
    return product;
  });

  return respondWithDetail(created, req, res, 201);
}

/* ------------------------------------------------------------------ *
 * PATCH /products/:id — edit (9.3: ACTIVE -> PENDING, version bump)
 * ------------------------------------------------------------------ */

async function updateProduct(req: AuthRequest, res: Response): Promise<Response> {
  const payload: PatchPayload = patchSchema.parse(req.body);
  const product = await loadOwnedProduct(req);

  if (product.status === "RESERVED" || product.status === "SOLD") {
    throw versionConflict("Tin đang được giữ hoặc đã bán nên không thể chỉnh sửa.");
  }
  if (product.isBlocked) {
    throw forbidden("Tin đang bị hạn chế, chưa thể chỉnh sửa.");
  }
  if (product.version !== payload.expected_version) {
    throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại để xem thông tin mới nhất.");
  }

  const normalized = await validateAndNormalize(payload, payload.images);
  const updated = await prisma.$transaction(async (tx) => {
    await assertSellerEligibleInTransaction(tx, product.sellerId, false);
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${product.id} FOR UPDATE`;
    const current = await tx.product.findUnique({ where: { id: product.id } });
    if (!current || current.sellerId !== product.sellerId || current.deletedAt !== null) {
      throw notFound(NOT_FOUND_MESSAGE);
    }
    if (current.status === "RESERVED" || current.status === "SOLD") {
      throw versionConflict("Tin đang được giữ hoặc đã bán nên không thể chỉnh sửa.");
    }
    if (current.isBlocked) throw forbidden("Tin đang bị hạn chế, chưa thể chỉnh sửa.");
    if (current.version !== payload.expected_version) {
      throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại để xem thông tin mới nhất.");
    }
    await assertCategoryEligibleInTransaction(tx, normalized.categoryId);
    let previousPaths: string[] = [];
    if (payload.images) {
      previousPaths = (await tx.productImage.findMany({
        where: { productId: product.id, storagePath: { not: null } },
        select: { storagePath: true },
      })).flatMap((image) => image.storagePath ? [image.storagePath] : []);
      await claimUploads(tx, current.sellerId, current.id, normalized.images);
    }
    const result = await tx.product.updateMany({
      where: { id: current.id, version: current.version },
      data: {
        title: normalized.title,
        description: normalized.description,
        price: normalized.price,
        condition: normalized.condition,
        usageMonths: normalized.usageMonths,
        categoryId: normalized.categoryId,
        provinceCode: normalized.provinceCode,
        deliveryMethod: normalized.deliveryMethod,
        shippingFee: normalized.shippingFee,
        // Editing an ACTIVE listing sends it back to moderation; publishedAt
        // stays unchanged so the first publication time survives.
        status: current.status === "ACTIVE" ? "PENDING" : current.status,
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại để xem thông tin mới nhất.");
    }
    if (payload.images) {
      const nextPaths = new Set(normalized.images.map((image) => image.storagePath));
      await detachUnusedUploads(
        tx,
        product.id,
        previousPaths.filter((storagePath) => !nextPaths.has(storagePath)),
      );
      await tx.productImage.deleteMany({ where: { productId: product.id } });
      await tx.productImage.createMany({
        data: imageCreateMany(normalized.images).map((image) => ({ ...image, productId: product.id })),
      });
    }
    return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: PRODUCT_INCLUDE });
  });

  return respondWithDetail(updated, req, res);
}

/* ------------------------------------------------------------------ *
 * POST /products/:id/submit — REJECTED | INACTIVE -> PENDING
 * ------------------------------------------------------------------ */

async function submitProduct(req: AuthRequest, res: Response): Promise<Response> {
  const product = await loadOwnedProduct(req);
  if (product.isBlocked) {
    throw forbidden("Tin đang bị hạn chế nên chưa thể gửi duyệt.");
  }
  if (product.status !== "REJECTED" && product.status !== "INACTIVE") {
    throw invalidTransition("Tin này không ở trạng thái gửi duyệt lại.");
  }
  const updated = await prisma.$transaction(async (tx) => {
    await assertSellerEligibleInTransaction(tx, product.sellerId, false);
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${product.id} FOR UPDATE`;
    const current = await tx.product.findUnique({ where: { id: product.id } });
    if (!current || current.sellerId !== product.sellerId || current.deletedAt !== null) {
      throw notFound(NOT_FOUND_MESSAGE);
    }
    if (current.isBlocked) throw forbidden("Tin đang bị hạn chế nên chưa thể gửi duyệt.");
    if (current.status !== "REJECTED" && current.status !== "INACTIVE") {
      throw invalidTransition("Tin này không ở trạng thái gửi duyệt lại.");
    }
    if (current.version !== product.version) {
      throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại để xem thông tin mới nhất.");
    }
    await assertCategoryEligibleInTransaction(tx, current.categoryId);
    return tx.product.update({
      where: { id: current.id },
      data: { status: "PENDING", rejectionReason: null, version: { increment: 1 } },
      include: PRODUCT_INCLUDE,
    });
  });
  return respondWithDetail(updated, req, res);
}

/* ------------------------------------------------------------------ *
 * POST /products/:id/hide — PENDING | REJECTED | ACTIVE | INACTIVE -> INACTIVE
 * ------------------------------------------------------------------ */

async function hideProduct(req: AuthRequest, res: Response): Promise<Response> {
  const product = await loadOwnedProduct(req);
  if (product.isBlocked) throw forbidden("Tin đang bị hạn chế nên chưa thể ẩn.");
  if (product.status === "RESERVED" || product.status === "SOLD") {
    throw invalidTransition("Không thể ẩn tin đang được giữ hoặc đã bán.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    await assertSellerEligibleInTransaction(tx, product.sellerId, false);
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${product.id} FOR UPDATE`;
    const current = await tx.product.findUnique({ where: { id: product.id } });
    if (!current || current.sellerId !== product.sellerId || current.deletedAt !== null) {
      throw notFound(NOT_FOUND_MESSAGE);
    }
    if (current.version !== product.version) {
      throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại để xem thông tin mới nhất.");
    }
    if (current.isBlocked) throw forbidden("Tin đang bị hạn chế nên chưa thể ẩn.");
    if (current.status === "RESERVED" || current.status === "SOLD") {
      throw invalidTransition("Không thể ẩn tin đang được giữ hoặc đã bán.");
    }
    return tx.product.update({
      where: { id: current.id },
      data: { status: "INACTIVE", version: { increment: 1 } },
      include: PRODUCT_INCLUDE,
    });
  });
  return respondWithDetail(updated, req, res);
}

/* ------------------------------------------------------------------ *
 * DELETE /products/:id — soft delete (never a hard delete)
 * ------------------------------------------------------------------ */

async function deleteProduct(req: AuthRequest, res: Response): Promise<Response> {
  const product = await loadOwnedProduct(req);
  if (product.isBlocked) throw forbidden("Tin đang bị hạn chế nên chưa thể xóa.");
  if (product.status === "RESERVED" || product.status === "SOLD") {
    throw invalidTransition("Không thể xóa tin đang được giữ hoặc đã bán.");
  }

  await prisma.$transaction(async (tx) => {
    await assertSellerEligibleInTransaction(tx, product.sellerId, false);
    await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${product.id} FOR UPDATE`;
    const current = await tx.product.findUnique({ where: { id: product.id } });
    if (!current || current.deletedAt !== null) throw notFound(NOT_FOUND_MESSAGE);
    if (current.version !== product.version) {
      throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại để xem thông tin mới nhất.");
    }
    if (current.isBlocked) throw forbidden("Tin đang bị hạn chế nên chưa thể xóa.");
    if (current.status === "RESERVED" || current.status === "SOLD") {
      throw invalidTransition("Không thể xóa tin đang được giữ hoặc đã bán.");
    }
    const paths = (await tx.productImage.findMany({
      where: { productId: product.id, storagePath: { not: null } },
      select: { storagePath: true },
    })).flatMap((image) => image.storagePath ? [image.storagePath] : []);
    await detachUnusedUploads(tx, product.id, paths);
    await tx.productImage.deleteMany({ where: { productId: product.id } });
    await tx.product.update({
      where: { id: product.id },
      data: { deletedAt: new Date(), status: "INACTIVE", version: { increment: 1 } },
    });
  });
  return ok(res, { id: product.id });
}

/* ------------------------------------------------------------------ *
 * GET /account/products — every own listing, newest first
 * ------------------------------------------------------------------ */

async function listOwnProducts(req: AuthRequest, res: Response): Promise<Response> {
  const viewerId = activeViewerIdOf(req);
  const parsed = ownListQuerySchema.parse(req.query);
  const paging = parsePaging(req.query);

  const status =
    parsed.status !== undefined
      ? assertEnumValue(
        parsed.status,
        PRODUCT_STATUSES,
        "status",
        "Trạng thái tin đăng không hợp lệ.",
      )
      : undefined;

  const where: Prisma.ProductWhereInput = { sellerId: viewerId };
  if (status !== undefined) where.status = status;

  const [total, rows, categoryIndex] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: offsetOf(paging),
      take: paging.page_size,
      include: PRODUCT_INCLUDE,
    }),
    loadCategoryIndex(),
  ]);

  const ctx = await buildProductContext(rows, req);
  return okList(
    res,
    rows.map((row) =>
      toOwnProduct(row, ctx, categoryIndex.path(row.categoryId), categoryIndex.active(row.categoryId)),
    ),
    pageMeta(paging, total),
  );
}

/* ------------------------------------------------------------------ *
 * Routers
 * ------------------------------------------------------------------ */

/** `GET /` serves both mounts: `/products` searches, `/account/products` lists own rows. */
const rootListHandler = asyncHandler(async (req: AuthRequest, res: Response) => {
  if (req.baseUrl.endsWith("/account/products")) {
    return listOwnProducts(req, res);
  }
  return searchProducts(req, res);
});

export const productsRouter = Router();

// Public reads; the viewer is optional so favourites/capabilities stay right.
productsRouter.get("/", optionalAuth, rootListHandler);
productsRouter.get("/:id", optionalAuth, asyncHandler(getProductDetail));

// Owner mutations: live session + ACTIVE account; creating also needs a
// verified email (detail-project 6).
productsRouter.post("/", authMiddleware, requireActive, requireVerified, asyncHandler(createProduct));
productsRouter.patch("/:id", authMiddleware, requireActive, asyncHandler(updateProduct));
productsRouter.post("/:id/submit", authMiddleware, requireActive, asyncHandler(submitProduct));
productsRouter.post("/:id/hide", authMiddleware, requireActive, asyncHandler(hideProduct));
productsRouter.delete("/:id", authMiddleware, requireActive, asyncHandler(deleteProduct));

export const accountProductsRouter = Router();
accountProductsRouter.get("/", rootListHandler);
