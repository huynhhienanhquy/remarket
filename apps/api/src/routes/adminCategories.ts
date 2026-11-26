import { moderationListFields } from "../shared/admin-query.js";
import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { AdminCategorySummary, CategoryPresentationInput } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { asyncHandler } from "../middleware/errorHandler.js";
import type { AuthRequest } from "../middleware/auth.js";
import { ok, okList } from "../shared/api-response.js";
import { notFound, validationError } from "../shared/errors.js";
import { toCategoryNode } from "../shared/dto-mappers.js";
import { moderationAuditFilter, adminActor, writeAudit } from "../shared/admin-helpers.js";
import { offsetOf, pageMeta, parsePaging } from "../shared/pagination.js";

/**
 * Category maintenance (detail-project 15): slugs are globally unique, the
 * tree is a root plus its children (max two levels), cycles are impossible
 * and every mutation is audited.
 */

const router = Router();

const categoryListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  ...moderationListFields,
}).strict();

// Includes inactive categories; the public category endpoint intentionally does not.
router.get("/tree", asyncHandler(async (_req, res) => {
  const roots = await prisma.category.findMany({
    where: { parentId: null },
    include: { children: { orderBy: [{ sortIndex: "asc" }, { name: "asc" }, { id: "asc" }] } },
    orderBy: [{ sortIndex: "asc" }, { name: "asc" }, { id: "asc" }],
  });
  ok(res, roots.map(toCategoryNode));
}));

router.get("/:id/summary", asyncHandler(async (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const category = await prisma.category.findUnique({ where: { id }, select: { id: true, children: { select: { id: true } } } });
  if (!category) throw notFound("Không tìm thấy danh mục.");
  const categoryId = { in: [id, ...category.children.map(child => child.id)] };
  const [active_products, pending_products, completed_orders] = await Promise.all([
    prisma.product.count({ where: { categoryId, deletedAt: null, status: "ACTIVE", isBlocked: false } }),
    prisma.product.count({ where: { categoryId, deletedAt: null, status: "PENDING" } }),
    prisma.order.count({ where: {
      status: "COMPLETED",
      completedAt: { gte: new Date(Date.now() - 30 * 86400000) },
      items: { some: { product: { categoryId } } },
    } }),
  ]);
  ok(res, { active_products, pending_products, completed_orders } satisfies AdminCategorySummary);
}));

// Pagination counts root groups and keeps each two-level subtree intact.
router.get("/", asyncHandler(async (req, res) => {
  const query = categoryListQuery.parse(req.query);
  const paging = parsePaging(req.query);
  const match: Prisma.CategoryWhereInput = {};
  if (query.q) match.name = { contains: query.q, mode: "insensitive" };
  if (query.status) match.status = query.status;
  const auditFilter = moderationAuditFilter(query.handled_by, query.from, query.to);
  if (auditFilter) match.moderationAudits = { some: auditFilter };
  const where: Prisma.CategoryWhereInput = {
    parentId: null,
    ...(Object.keys(match).length > 0 ? { OR: [match, { children: { some: match } }] } : {}),
  };
  const [roots, total] = await Promise.all([
    prisma.category.findMany({
      where,
      include: { children: { orderBy: [{ sortIndex: "asc" }, { name: "asc" }, { id: "asc" }] } },
      orderBy: [{ sortIndex: "asc" }, { name: "asc" }, { id: "asc" }],
      skip: offsetOf(paging),
      take: paging.page_size,
    }),
    prisma.category.count({ where }),
  ]);
  okList(res, roots.map(toCategoryNode), pageMeta(paging, total));
}));

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Kebab-case slug derived from a possibly Vietnamese display name. */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toSlug(value: string): string {
  const slug = slugify(value);
  if (slug === "" || !SLUG_PATTERN.test(slug)) {
    throw validationError("Thông tin danh mục chưa hợp lệ.", {
      slug: "Slug không hợp lệ, chỉ dùng chữ thường, số và dấu gạch ngang.",
    });
  }
  return slug;
}

async function assertSlugAvailable(
  tx: Prisma.TransactionClient,
  slug: string,
  excludeId?: string,
): Promise<void> {
  const existing = await tx.category.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing !== null && existing.id !== excludeId) {
    throw validationError("Thông tin danh mục chưa hợp lệ.", {
      slug: "Slug đã được sử dụng, vui lòng chọn slug khác.",
    });
  }
}

async function loadParentForUpdate(tx: Prisma.TransactionClient, parentId: string) {
  await tx.$queryRaw`SELECT "id" FROM "Category" WHERE "id" = ${parentId} FOR UPDATE`;
  const parent = await tx.category.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true, _count: { select: { products: true } } },
  });
  if (parent === null) {
    throw validationError("Thông tin danh mục chưa hợp lệ.", {
      parent_id: "Danh mục cha không tồn tại.",
    });
  }
  return parent;
}

function assertParentAcceptsChildren(parent: Awaited<ReturnType<typeof loadParentForUpdate>>): void {
  if (parent.parentId !== null) {
    throw validationError("Thông tin danh mục chưa hợp lệ.", {
      parent_id: "Chỉ hỗ trợ tối đa hai cấp danh mục.",
    });
  }
  if (parent._count.products > 0) {
    throw validationError("Thông tin danh mục chưa hợp lệ.", {
      parent_id: "Danh mục đang chứa tin đăng nên phải tiếp tục là danh mục cấp cuối.",
    });
  }
}

/** A new child needs an existing root parent (root + children only). */
async function assertParentUsable(tx: Prisma.TransactionClient, parentId: string): Promise<void> {
  assertParentAcceptsChildren(await loadParentForUpdate(tx, parentId));
}

/**
 * Reparenting must keep a two-level tree: reject a self reference, an
 * ancestor of the category (a cycle) and any parent that is not a root.
 */
async function assertNewParent(
  tx: Prisma.TransactionClient,
  categoryId: string,
  parentId: string,
): Promise<void> {
  if (parentId === categoryId) {
    throw validationError("Thông tin danh mục chưa hợp lệ.", {
      parent_id: "Không thể chọn chính danh mục này làm danh mục cha.",
    });
  }

  const parent = await loadParentForUpdate(tx, parentId);

  // Walking up from the proposed parent: meeting `categoryId` means the move
  // would turn that ancestor chain into a cycle.
  let cursor: string | null = parent.id;
  const seen = new Set<string>();
  while (cursor !== null) {
    if (cursor === categoryId) {
      throw validationError("Thông tin danh mục chưa hợp lệ.", {
        parent_id: "Không thể tạo vòng lặp danh mục.",
      });
    }
    if (seen.has(cursor)) break;
    seen.add(cursor);
    const node: { parentId: string | null } | null = await tx.category.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    if (node === null) break;
    cursor = node.parentId;
  }

  assertParentAcceptsChildren(parent);
}

const categoryPresentation = {
  icon: z.string().trim().regex(/^[a-z][a-z0-9_]*$/).max(64).nullable().optional(),
  sort_index: z.number().int().min(0).max(99999).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  accept_new_listings: z.boolean().optional(),
  show_on_home: z.boolean().nullable().optional(),
};

function presentationFields(input: CategoryPresentationInput) {
  return {
    icon: input.icon,
    sortIndex: input.sort_index,
    description: input.description,
    acceptNewListings: input.accept_new_listings,
    showOnHome: input.show_on_home,
  };
}

const createBody = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: z.string().trim().min(1).max(120).optional(),
    parent_id: z.string().trim().min(1).max(64).nullable().optional(),
    ...categoryPresentation,
  })
  .strict();

// POST /api/v1/admin/categories
router.post(
  "/",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const body = createBody.parse(req.body);

    const slug = toSlug(body.slug ?? body.name);
    const category = await prisma.$transaction(async (tx) => {
      await assertSlugAvailable(tx, slug);
      let parentId: string | null = null;
      if (body.parent_id !== undefined && body.parent_id !== null) {
        await assertParentUsable(tx, body.parent_id);
        parentId = body.parent_id;
      }
      const created = await tx.category.create({
        data: { name: body.name, slug, parentId, ...presentationFields(body) },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: "category.create",
        entityType: "category",
        entityId: created.id,
        reason: null,
        metadata: { slug: created.slug, parent_id: created.parentId, sort_index: created.sortIndex },
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    ok(res, toCategoryNode(category), 201);
  }),
);

const updateBody = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    slug: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
    parent_id: z.string().trim().min(1).max(64).nullable().optional(),
    ...categoryPresentation,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Cần ít nhất một trường danh mục để cập nhật.",
  });

// PATCH /api/v1/admin/categories/:id
router.patch(
  "/:id",
  asyncHandler(async (req: AuthRequest, res) => {
    const actor = adminActor(req);
    const id = req.params.id;
    const body = updateBody.parse(req.body);

    const updated = await prisma.$transaction(async (tx) => {
      if (id === undefined) throw notFound("Không tìm thấy danh mục này.");
      await tx.$queryRaw`SELECT "id" FROM "Category" WHERE "id" = ${id} FOR UPDATE`;
      const existing = await tx.category.findUnique({
        where: { id },
        include: { _count: { select: { children: true } } },
      });
      if (existing === null) throw notFound("Không tìm thấy danh mục này.");

      const name = body.name ?? existing.name;
      const status = body.status ?? existing.status;
      let slug = existing.slug;
      let parentId = existing.parentId;

      if (body.slug !== undefined) {
        slug = toSlug(body.slug);
        await assertSlugAvailable(tx, slug, existing.id);
      }

      if (body.parent_id !== undefined) {
        if (body.parent_id === null) {
          parentId = null;
        } else {
          await assertNewParent(tx, existing.id, body.parent_id);
          if (existing._count.children > 0) {
            throw validationError("Thông tin danh mục chưa hợp lệ.", {
              parent_id: "Danh mục đang có danh mục con nên không thể gán làm danh mục con.",
            });
          }
          parentId = body.parent_id;
        }
      }

      const saved = await tx.category.update({
        where: { id: existing.id },
        data: { name, slug, status, parentId, ...presentationFields(body) },
      });
      await writeAudit(tx, {
        actorId: actor.id,
        actorName: actor.fullName,
        action: saved.status === "INACTIVE" ? "category.disable" : "category.update",
        entityType: "category",
        entityId: saved.id,
        reason: null,
        metadata: { status: saved.status, parent_id: saved.parentId, sort_index: saved.sortIndex, accept_new_listings: saved.acceptNewListings, show_on_home: saved.showOnHome },
      });
      return saved;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    ok(res, toCategoryNode(updated));
  }),
);

export { router as adminCategoriesRouter };
