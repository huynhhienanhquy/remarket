import type { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
import { invalidTransition, notFound, versionConflict } from "../shared/errors.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";
import { toAdminProductItem } from "../shared/dto-mappers.js";
import { administeredEntityIds, adminActor, adminDateRange, writeAudit } from "../shared/admin-helpers.js";
import { blockProduct } from "../services/admin-moderation.js";

/**
 * Moderation queue (detail-project 9.3 / 15): approve and reject only apply
 * to `PENDING` with an expected version, block/unblock are independent of the
 * listing status and every mutation is audited.
 */

const router = Router();

const listQuery = z
  .object({
    status: z
      .enum([
        "PENDING",
        "ACTIVE",
        "REJECTED",
        "RESERVED",
        "SOLD",
        "INACTIVE",
        "BLOCKED",
        "ALL",
      ])
      .optional(),
    q: z.string().trim().max(100).optional(),
    category_id: z.string().trim().min(1).max(64).optional(),
    seller_id: z.string().trim().min(1).max(64).optional(),
    handled_by: z.string().trim().min(1).max(64).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.string().optional(),
    page_size: z.string().optional(),
  })
  .strict();

async function loadProduct(id: string | undefined) {
  if (id === undefined) throw notFound("Không tìm thấy tin đăng này.");
  const product = await prisma.product.findUnique({
    where: { id },
    include: { images: { orderBy: { sortOrder: "asc" } }, seller: true, category: true },
  });
  // Soft-deleted listings are invisible to moderation (same as the UI mock).
  if (product === null || product.deletedAt !== null) {
    throw notFound("Không tìm thấy tin đăng này.");
  }
  return product;
}

// GET /api/v1/admin/products?status&q&category_id&page&page_size
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = listQuery.parse(req.query);
    const paging = parsePaging(req.query);

    const where: Prisma.ProductWhereInput = { deletedAt: null };
    const handledIds = await administeredEntityIds("product", query.handled_by);
    if (handledIds) where.id = { in: handledIds };
    if (query.status === "BLOCKED") {
      where.isBlocked = true;
    } else if (query.status !== undefined && query.status !== "ALL") {
      where.status = query.status;
    }
    if (query.category_id !== undefined) where.categoryId = query.category_id;
    if (query.seller_id !== undefined) where.sellerId = query.seller_id;
    if (query.q !== undefined) where.title = { contains: query.q, mode: "insensitive" };
    where.createdAt = adminDateRange(query.from, query.to);

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { images: { orderBy: { sortOrder: "asc" } }, seller: true, category: true },
        orderBy: { createdAt: "desc" },
        skip: offsetOf(paging),
        take: paging.page_size,
      }),
      prisma.product.count({ where }),
    ]);

    okList(
      res,
      products.map((product) => toAdminProductItem(product, product.category.name)),
      pageMeta(paging, total),
    );
  }),
);

const versionBody = z.object({ expected_version: z.coerce.number().int().min(1) }).strict();
const rejectBody = z
  .object({
    expected_version: z.coerce.number().int().min(1),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
const blockBody = z.object({ expected_version: z.coerce.number().int().min(1), reason: z.string().trim().min(1).max(500) }).strict();

// POST /api/v1/admin/products/:id/approve
router.post(
  "/:id/approve",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = versionBody.parse(req.body);
    const product = await loadProduct(req.params.id);

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${product.sellerId} FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${product.id} FOR UPDATE`;
      const current = await tx.product.findUnique({
        where: { id: product.id },
        include: {
          seller: { select: { status: true, emailVerifiedAt: true } },
          category: { include: { parent: true, _count: { select: { children: true } } } },
        },
      });
      if (!current || current.deletedAt !== null) throw notFound("Không tìm thấy tin đăng này.");
      if (current.version !== body.expected_version) {
        throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại và xem xét bản mới nhất.");
      }
      if (current.status !== "PENDING") {
        throw invalidTransition("Chỉ duyệt được tin đang chờ duyệt.");
      }
      if (current.isBlocked) throw invalidTransition("Tin đăng đang bị chặn nên không thể duyệt.");
      if (current.seller.status !== "ACTIVE" || current.seller.emailVerifiedAt === null) {
        throw invalidTransition("Tài khoản người bán chưa đủ điều kiện để công khai tin.");
      }
      await tx.$queryRaw`SELECT "id" FROM "Category" WHERE "id" = ${current.categoryId} FOR UPDATE`;
      let category = await tx.category.findUnique({
        where: { id: current.categoryId },
        include: { parent: true, _count: { select: { children: true } } },
      });
      if (!category) throw invalidTransition("Danh mục của tin đăng không còn tồn tại.");
      if (category.parentId) {
        await tx.$queryRaw`SELECT "id" FROM "Category" WHERE "id" = ${category.parentId} FOR UPDATE`;
        category = await tx.category.findUnique({
          where: { id: current.categoryId },
          include: { parent: true, _count: { select: { children: true } } },
        });
      }
      if (
        !category ||
        category.status !== "ACTIVE" ||
        category._count.children > 0 ||
        (category.parent !== null && category.parent.status !== "ACTIVE")
      ) {
        throw invalidTransition("Danh mục cấp cuối của tin đăng không còn hoạt động.");
      }

      const nextVersion = current.version + 1;
      const updated = await tx.product.updateMany({
        where: { id: current.id, version: current.version, status: "PENDING", isBlocked: false },
        data: {
          status: "ACTIVE",
          // A re-approved listing keeps its first publication time.
          publishedAt: current.publishedAt ?? now,
          rejectionReason: null,
          reviewedBy: actor.id,
          reviewedAt: now,
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại và xem xét bản mới nhất.");
      }
      await tx.notification.createMany({
        data: [
          {
            userId: current.sellerId,
            type: "PRODUCT_APPROVED",
            title: "Tin đăng đã được phê duyệt",
            content: `Tin đăng "${current.title}" đã được phê duyệt và hiển thị công khai.`,
            referenceType: "product",
            referenceId: current.id,
            dedupeKey: `product-approved:${current.id}:v${nextVersion}`,
          },
        ],
        skipDuplicates: true,
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: "product.approve",
        entityType: "product",
        entityId: current.id,
        reason: null,
        metadata: { version: nextVersion },
      });
    });

    const saved = await loadProduct(product.id);
    ok(res, toAdminProductItem(saved, saved.category.name));
  }),
);

// POST /api/v1/admin/products/:id/reject
router.post(
  "/:id/reject",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = rejectBody.parse(req.body);
    const product = await loadProduct(req.params.id);

    if (product.status !== "PENDING") {
      throw invalidTransition("Chỉ từ chối được tin đang chờ duyệt.");
    }
    if (product.version !== body.expected_version) {
      throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại và xem xét bản mới nhất.");
    }

    const nextVersion = product.version + 1;
    await prisma.$transaction(async (tx) => {
      const updated = await tx.product.updateMany({
        where: { id: product.id, version: product.version, status: "PENDING" },
        data: {
          status: "REJECTED",
          rejectionReason: body.reason,
          reviewedBy: actor.id,
          reviewedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (updated.count === 0) {
        throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại và xem xét bản mới nhất.");
      }
      await tx.notification.createMany({
        data: [
          {
            userId: product.sellerId,
            type: "PRODUCT_REJECTED",
            title: "Tin đăng bị từ chối",
            content: `Tin đăng "${product.title}" không được phê duyệt. Lý do: ${body.reason}`,
            referenceType: "product",
            referenceId: product.id,
            dedupeKey: `product-rejected:${product.id}:v${nextVersion}`,
          },
        ],
        skipDuplicates: true,
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: "product.reject",
        entityType: "product",
        entityId: product.id,
        reason: body.reason,
        metadata: { version: nextVersion },
      });
    });

    const saved = await loadProduct(product.id);
    ok(res, toAdminProductItem(saved, saved.category.name));
  }),
);

// POST /api/v1/admin/products/:id/block
router.post(
  "/:id/block",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = blockBody.parse(req.body);
    const product = await loadProduct(req.params.id);
    await prisma.$transaction(async (tx) => {
      await blockProduct(tx, {
        productId: product.id,
        reason: body.reason,
        actor,
        expectedVersion: body.expected_version,
      });
    });

    const saved = await loadProduct(product.id);
    ok(res, toAdminProductItem(saved, saved.category.name));
  }),
);

// POST /api/v1/admin/products/:id/unblock
router.post(
  "/:id/unblock",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = versionBody.parse(req.body);
    const product = await loadProduct(req.params.id);

    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${product.id} FOR UPDATE`;
      const current = await tx.product.findUnique({ where: { id: product.id } });
      if (!current || current.deletedAt !== null) throw notFound("Không tìm thấy tin đăng này.");
      if (current.version !== body.expected_version) {
        throw versionConflict("Tin đăng đã thay đổi. Vui lòng tải lại và xem xét bản mới nhất.");
      }
      if (!current.isBlocked) throw invalidTransition("Tin đăng này hiện không bị chặn.");

      // Lifting a moderation block never republishes an unsold listing. The
      // seller must explicitly resubmit it; held/sold historical state stays.
      const nextStatus =
        current.status === "RESERVED" || current.status === "SOLD"
          ? current.status
          : "INACTIVE";
      const nextVersion = current.version + 1;
      await tx.product.update({
        where: { id: current.id },
        data: {
          isBlocked: false,
          blockReason: null,
          status: nextStatus,
          version: { increment: 1 },
        },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: "product.unblock",
        entityType: "product",
        entityId: current.id,
        reason: null,
        metadata: { version: nextVersion },
      });
    });

    const saved = await loadProduct(product.id);
    ok(res, toAdminProductItem(saved, saved.category.name));
  }),
);

export { router as adminProductsRouter };
