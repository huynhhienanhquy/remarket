import { Prisma, type Product } from "@prisma/client";
import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import type { Condition, DeliveryMethod } from "@remarket/shared";
import {
  CONDITIONS,
  DELIVERY_METHODS,
  PRODUCT_LIMITS,
  PRODUCT_STATUSES,
  SORT_OPTIONS,
  normalizePriceFilter,
  normalizeVndInput,
  validateCondition,
  validateDeliveryMethod,
  validateDescription,
  validatePriceInput,
  validateProductTitle,
  validateShippingFeeFor,
  validateUsageMonths,
} from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import { authMiddleware, optionalAuth, requireActive, requireVerified } from "../middleware/auth.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
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
import { isOwnerOrAdmin, toOwnProduct, toProductDetail, toProductListItem } from "../shared/dto-mappers.js";
import type { ProductRow } from "../shared/dto-mappers.js";
import { activeCategoryIds, buildProductContext, loadCategoryChain } from "../shared/viewer.js";
import { isKnownProvinceCode } from "../shared/geography.js";

/**
 * Product routes (detail-project 9): public search and detail, owner-only
 * mutations following the 9.3 state machine, plus the `/account/products`
 * listing of one's own rows (blocked and soft-deleted included).
 *
 * `app.ts` mounts `productsRouter` at `/products` and a dedicated read-only
 * `accountProductsRouter` at `/account/products` so undocumented mutation
 * aliases cannot leak under the account route.
 *
 * Validation messages mirror `apps/web/src/mocks/adapter-products.ts` so the
 * live API reports exactly what the form already shows.
 */

const NOT_FOUND_MESSAGE = "Không tìm thấy tin đăng này.";
const BUYABLE_STATUSES = ["ACTIVE", "RESERVED", "SOLD"] as const;

const MISSING_VIEWER = "Bạn cần đăng nhập để tiếp tục.";

function viewerIdOf(req: AuthRequest): string {
  if (!req.user) throw unauthorized(MISSING_VIEWER);
  return req.user.id;
}

/** Own listings stay behind an ACTIVE account (mock `requireActive`). */
function activeViewerIdOf(req: AuthRequest): string {
  const viewerId = viewerIdOf(req);
  if (req.user?.status !== "ACTIVE") throw accountLocked();
  return viewerId;
}

function assertEnumValue<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
  message: string,
): T {
  if (!allowed.includes(value as T)) {
    throw validationError(message, { [field]: message });
  }
  return value as T;
}

/* ------------------------------------------------------------------ *
 * Input schemas (zod strict, no mass assignment)
 * ------------------------------------------------------------------ */

const imageSchema = z
  .object({
    url: z.string({ required_error: "Ảnh không hợp lệ.", invalid_type_error: "Ảnh không hợp lệ." }),
    sort_order: z.number({
      required_error: "Thứ tự ảnh là bắt buộc.",
      invalid_type_error: "Thứ tự ảnh phải là số.",
    }),
    storage_path: z.string().optional(),
  })
  .strict();

const productFields = z.object({
  title: z.string({ required_error: "Tên món đồ là bắt buộc.", invalid_type_error: "Tên món đồ không hợp lệ." }),
  description: z.string({
    required_error: "Mô tả là bắt buộc.",
    invalid_type_error: "Mô tả không hợp lệ.",
  }),
  category_id: z.string({ required_error: "Hãy chọn danh mục.", invalid_type_error: "Danh mục không hợp lệ." }),
  price: z.string({ required_error: "Giá không được để trống.", invalid_type_error: "Giá không hợp lệ." }),
  condition: z.string({
    required_error: "Hãy chọn tình trạng món đồ.",
    invalid_type_error: "Tình trạng món đồ không hợp lệ.",
  }),
  usage_months: z
    .number({ invalid_type_error: "Số tháng sử dụng không hợp lệ." })
    .nullable()
    .optional(),
  province_code: z.string({
    required_error: "Hãy chọn khu vực.",
    invalid_type_error: "Khu vực không hợp lệ.",
  }),
  delivery_method: z.string({
    required_error: "Hãy chọn hình thức giao nhận.",
    invalid_type_error: "Hình thức giao nhận không hợp lệ.",
  }),
  shipping_fee: z.string({
    required_error: "Phí giao hàng không được để trống.",
    invalid_type_error: "Phí giao hàng không hợp lệ.",
  }),
});

const imagesField = z.array(imageSchema);
const createSchema = productFields.extend({ images: imagesField }).strict();
const patchSchema = productFields
  .extend({
    images: imagesField.optional(),
    expected_version: z
      .number({
        required_error: "Thiếu phiên bản tin đăng.",
        invalid_type_error: "Phiên bản tin đăng không hợp lệ.",
      })
      .int("Phiên bản tin đăng phải là số nguyên."),
  })
  .strict();

type ImagePayload = z.infer<typeof imageSchema>;
type ProductFields = z.infer<typeof productFields>;
type CreatePayload = z.infer<typeof createSchema>;
type PatchPayload = z.infer<typeof patchSchema>;

interface NormalizedProduct {
  title: string;
  description: string;
  categoryId: string;
  price: string;
  condition: Condition;
  usageMonths: number | null;
  provinceCode: string;
  deliveryMethod: DeliveryMethod;
  shippingFee: string;
  images: { url: string; storagePath: string; sortOrder: number }[];
}

/** 1-8 images, contiguous `sort_order` from 0, every URL present (mock). */
function assertImages(images: readonly ImagePayload[]): void {
  if (images.length < 1 || images.length > PRODUCT_LIMITS.imagesMax) {
    throw validationError("Số lượng ảnh không hợp lệ.", {
      images: `Cần từ 1 đến ${PRODUCT_LIMITS.imagesMax} ảnh.`,
    });
  }
  images.forEach((image, index) => {
    if (image.sort_order !== index) {
      throw validationError("Thứ tự ảnh không hợp lệ.", { images: "sort_order phải liên tục từ 0." });
    }
    if (image.url.trim() === "") {
      throw validationError("Ảnh chưa được tải lên.", { images: `Ảnh ${index + 1} chưa tải xong.` });
    }
    if (!image.storage_path?.trim()) {
      throw validationError("Ảnh chưa được tải lên.", {
        images: `Ảnh ${index + 1} thiếu đường dẫn lưu trữ hợp lệ.`,
      });
    }
  });
}

/**
 * Collects every field error first (one `VALIDATION_ERROR` with all messages,
 * like the mock), then normalizes the payload for the database.
 */
async function validateAndNormalize(
  fields: ProductFields,
  images: readonly ImagePayload[] | undefined,
): Promise<NormalizedProduct> {
  const errors: Record<string, string> = {};

  const titleError = validateProductTitle(fields.title);
  if (titleError) errors.title = titleError;
  const descriptionError = validateDescription(fields.description);
  if (descriptionError) errors.description = descriptionError;
  const priceError = validatePriceInput(fields.price);
  if (priceError) errors.price = priceError;

  const usageError = validateUsageMonths(
    fields.usage_months === undefined || fields.usage_months === null
      ? ""
      : String(fields.usage_months),
  );
  if (usageError) errors.usage_months = usageError;

  const conditionError = validateCondition(fields.condition);
  if (conditionError) errors.condition = conditionError;

  const deliveryError = validateDeliveryMethod(fields.delivery_method);
  if (deliveryError) {
    errors.delivery_method = deliveryError;
  } else if (fields.delivery_method === "MEETUP") {
    // Gặp trực tiếp: phí giao hàng bắt buộc bằng 0 (mock + detail-project 7.2).
    if (normalizeVndInput(fields.shipping_fee) !== "0") {
      errors.shipping_fee = "Gặp trực tiếp thì phí giao hàng phải bằng 0.";
    }
  } else {
    const shippingError = validateShippingFeeFor(
      fields.shipping_fee,
      fields.delivery_method as DeliveryMethod,
    );
    if (shippingError) errors.shipping_fee = shippingError;
  }

  const provinceCode = fields.province_code.trim();
  if (provinceCode === "") {
    errors.province_code = "Hãy chọn khu vực.";
  } else if (!isKnownProvinceCode(provinceCode)) {
    errors.province_code = "Tỉnh/thành phố không hợp lệ.";
  }

  const category = await prisma.category.findUnique({ where: { id: fields.category_id } });
  if (!category) {
    errors.category_id = "Danh mục không tồn tại.";
  } else {
    const chain = await loadCategoryChain(fields.category_id);
    if (!chain.exists || !chain.isLeaf || !chain.active) {
      errors.category_id = "Chỉ chọn danh mục cấp cuối còn hoạt động.";
    }
  }

  if (Object.keys(errors).length > 0) {
    throw validationError("Thông tin món đồ chưa hợp lệ.", errors);
  }

  if (images) assertImages(images);

  // `validateCondition` / `validateDeliveryMethod` above already rejected every
  // value outside these unions; the casts only narrow for the compiler.
  const priceDigits = normalizeVndInput(fields.price);
  const shippingFee = normalizeVndInput(fields.shipping_fee);

  return {
    title: fields.title.trim(),
    description: fields.description.trim(),
    categoryId: fields.category_id,
    price: priceDigits ?? "0",
    condition: fields.condition as Condition,
    usageMonths: fields.usage_months ?? null,
    provinceCode,
    deliveryMethod: fields.delivery_method as DeliveryMethod,
    shippingFee: fields.delivery_method === "MEETUP" ? "0" : shippingFee ?? "0",
    images: (images ?? []).map((image) => ({
      url: `/api/v1/uploads/${image.storage_path!.trim().split("/").at(-1)}`,
      storagePath: image.storage_path!.trim(),
      sortOrder: image.sort_order,
    })),
  };
}

function imageCreateMany(images: readonly { url: string; storagePath: string; sortOrder: number }[]) {
  return images.map((image) => ({
    url: image.url,
    storagePath: image.storagePath,
    sortOrder: image.sortOrder,
  }));
}

async function assertCategoryEligibleInTransaction(
  tx: Prisma.TransactionClient,
  categoryId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Category" WHERE "id" = ${categoryId} FOR SHARE`;
  let category = await tx.category.findUnique({
    where: { id: categoryId },
    include: {
      parent: { select: { id: true, parentId: true, status: true } },
      _count: { select: { children: true } },
    },
  });
  if (category?.parentId) {
    await tx.$queryRaw`SELECT "id" FROM "Category" WHERE "id" = ${category.parentId} FOR SHARE`;
    category = await tx.category.findUnique({
      where: { id: categoryId },
      include: {
        parent: { select: { id: true, parentId: true, status: true } },
        _count: { select: { children: true } },
      },
    });
  }
  if (
    !category ||
    category.status !== "ACTIVE" ||
    category._count.children > 0 ||
    (category.parent !== null &&
      (category.parent.status !== "ACTIVE" || category.parent.parentId !== null))
  ) {
    throw validationError("Thông tin món đồ chưa hợp lệ.", {
      category_id: "Chỉ chọn danh mục cấp cuối còn hoạt động.",
    });
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

async function lockEligibleUploads(
  tx: Prisma.TransactionClient,
  userId: string,
  productId: string,
  images: readonly { storagePath: string }[],
): Promise<string[]> {
  const paths = images.map((image) => image.storagePath);
  if (new Set(paths).size !== paths.length) {
    throw validationError("Ảnh bị trùng lặp.", { images: "Mỗi ảnh chỉ được dùng một lần." });
  }
  const sortedPaths = [...paths].sort();
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "UploadAsset" WHERE "storagePath" IN (${Prisma.join(sortedPaths)}) ORDER BY "storagePath" FOR UPDATE`,
  );
  const assets = await tx.uploadAsset.findMany({ where: { storagePath: { in: paths } } });
  const byPath = new Map(assets.map((asset) => [asset.storagePath, asset]));
  for (const storagePath of paths) {
    const asset = byPath.get(storagePath);
    if (
      !asset ||
      asset.userId !== userId ||
      asset.purpose !== "product" ||
      (asset.attachedAt !== null && asset.productId !== productId)
    ) {
      throw validationError("Ảnh không thuộc tin đăng này.", {
        images: "Hãy tải lại ảnh bằng chính tài khoản đang đăng tin.",
      });
    }
  }
  return assets.map((asset) => asset.id);
}

async function claimUploads(tx: Prisma.TransactionClient, userId: string, productId: string, images: readonly { storagePath: string }[]): Promise<void> {
  const ids = await lockEligibleUploads(tx, userId, productId, images);
  await tx.uploadAsset.updateMany({
    where: { id: { in: ids } },
    data: { productId, attachedAt: new Date() },
  });
}

async function detachUnusedUploads(
  tx: Prisma.TransactionClient,
  productId: string,
  storagePaths: string[],
): Promise<void> {
  if (storagePaths.length === 0) return;
  const urlToPath = new Map(
    storagePaths.map((storagePath) => [
      `/api/v1/uploads/${storagePath.split("/").at(-1)}`,
      storagePath,
    ]),
  );
  const snapshots = await tx.orderItem.findMany({
    where: {
      OR: [
        { imagePathSnapshot: { in: storagePaths } },
        { imageUrl: { in: [...urlToPath.keys()] } },
      ],
    },
    select: { imagePathSnapshot: true, imageUrl: true },
  });
  const retained = new Set<string>();
  for (const item of snapshots) {
    if (item.imagePathSnapshot && storagePaths.includes(item.imagePathSnapshot)) {
      retained.add(item.imagePathSnapshot);
    }
    if (item.imageUrl) {
      const path = urlToPath.get(item.imageUrl);
      if (path) retained.add(path);
    }
  }
  const detachable = storagePaths.filter((storagePath) => !retained.has(storagePath));
  if (detachable.length === 0) return;
  await tx.uploadAsset.updateMany({
    where: { productId, storagePath: { in: detachable } },
    data: { productId: null, attachedAt: null },
  });
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

type CategoryLink = { id: string; parentId: string | null };

function childrenOf(categories: readonly CategoryLink[]): Map<string, string[]> {
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (category.parentId === null) continue;
    const siblings = children.get(category.parentId);
    if (siblings) siblings.push(category.id);
    else children.set(category.parentId, [category.id]);
  }
  return children;
}

/** The category itself plus every descendant (a parent filter includes children). */
function subtreeOf(rootId: string, children: Map<string, string[]>): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack: string[] = [rootId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    ids.push(current);
    const kids = children.get(current);
    if (kids) stack.push(...kids);
  }
  return ids;
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

  const active = (categoryId: string): boolean => {
    const first = byId.get(categoryId);
    if (!first || first.status !== "ACTIVE") return false;
    const guard = new Set<string>([categoryId]);
    let cursor = first.parentId;
    while (cursor !== null) {
      if (guard.has(cursor)) return false;
      guard.add(cursor);
      const parent = byId.get(cursor);
      if (!parent || parent.status !== "ACTIVE") return false;
      cursor = parent.parentId;
    }
    return true;
  };

  return { path, active };
}

/* ------------------------------------------------------------------ *
 * GET /products — public search (detail-project 9.2)
 * ------------------------------------------------------------------ */

const searchQuerySchema = z
  .object({
    q: z
      .string({ invalid_type_error: "Từ khóa không hợp lệ." })
      .max(100, "Từ khóa tối đa 100 ký tự.")
      .optional(),
    category_id: z.string({ invalid_type_error: "Danh mục không hợp lệ." }).optional(),
    min_price: z.string({ invalid_type_error: "Giá từ không hợp lệ." }).optional(),
    max_price: z.string({ invalid_type_error: "Giá đến không hợp lệ." }).optional(),
    condition: z.string({ invalid_type_error: "Tình trạng món đồ không hợp lệ." }).optional(),
    province_code: z.string({ invalid_type_error: "Khu vực không hợp lệ." }).optional(),
    delivery_method: z.string({ invalid_type_error: "Hình thức giao nhận không hợp lệ." }).optional(),
    sort: z.string({ invalid_type_error: "Sắp xếp không hợp lệ." }).optional(),
    page: z.unknown().optional(),
    page_size: z.unknown().optional(),
  })
  .strict();

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

  const keyword = (parsed.q ?? "").trim();
  const activeIds = await activeCategoryIds();

  const where: Prisma.ProductWhereInput = {
    status: { in: ["ACTIVE"] },
    deletedAt: null,
    isBlocked: false,
    seller: { status: "ACTIVE", emailVerifiedAt: { not: null } },
    categoryId: { in: [...activeIds] },
  };

  if (keyword !== "" || parsed.category_id !== undefined) {
    const categories = await prisma.category.findMany({
      select: { id: true, parentId: true, name: true },
    });
    const children = childrenOf(categories);

    if (parsed.category_id !== undefined) {
      const allowed = subtreeOf(parsed.category_id, children).filter((id) => activeIds.has(id));
      where.categoryId = { in: allowed };
    }

    if (keyword !== "") {
      const needle = keyword.toLowerCase();
      const matching = new Set<string>();
      for (const category of categories) {
        if (category.name.toLowerCase().includes(needle)) {
          for (const id of subtreeOf(category.id, children)) matching.add(id);
        }
      }
      const clauses: Prisma.ProductWhereInput[] = [
        { title: { contains: keyword, mode: "insensitive" } },
        { description: { contains: keyword, mode: "insensitive" } },
      ];
      if (matching.size > 0) clauses.push({ categoryId: { in: [...matching] } });
      where.OR = clauses;
    }
  }

  if (condition !== undefined) where.condition = condition;
  if (parsed.province_code !== undefined && parsed.province_code !== "") {
    where.provinceCode = parsed.province_code;
  }
  if (priceRange.min !== null || priceRange.max !== null) {
    const price: { gte?: string; lte?: string } = {};
    if (priceRange.min !== null) price.gte = priceRange.min;
    if (priceRange.max !== null) price.lte = priceRange.max;
    where.price = price;
  }
  if (deliveryMethod === "BOTH") {
    where.deliveryMethod = "BOTH";
  } else if (deliveryMethod === "COD") {
    where.deliveryMethod = { in: ["COD", "BOTH"] };
  } else if (deliveryMethod === "MEETUP") {
    where.deliveryMethod = { in: ["MEETUP", "BOTH"] };
  }

  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    sort === "price_asc"
      ? [{ price: "asc" }, { id: "asc" }]
      : sort === "price_desc"
        ? [{ price: "desc" }, { id: "asc" }]
        : [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }];

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: offsetOf(paging),
      take: paging.page_size,
      include: PRODUCT_INCLUDE,
    }),
  ]);

  const ctx = await buildProductContext(rows, req);
  return okList(
    res,
    rows.map((row) => toProductListItem(row, ctx)),
    pageMeta(paging, total),
  );
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

  const ctx = await buildProductContext([product], req);
  const chain = await loadCategoryChain(product.categoryId);
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

const ownListQuerySchema = z
  .object({
    status: z.string({ invalid_type_error: "Trạng thái tin đăng không hợp lệ." }).optional(),
    page: z.unknown().optional(),
    page_size: z.unknown().optional(),
  })
  .strict();

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
accountProductsRouter.get("/", optionalAuth, rootListHandler);
