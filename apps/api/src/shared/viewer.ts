import type { Category, Product } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import type { AuthRequest } from "../middleware/auth.js";
import type { ViewerContext } from "./dto-mappers.js";
import { loadSellerAggregates } from "./seller-aggregates.js";

/**
 * Shared read helpers so every list/detail route builds the same viewer
 * context and the same category projection (detail-project 8/9).
 */

export function viewerFrom(req: AuthRequest): Omit<ViewerContext, "favorited" | "aggregates"> {
  return {
    viewerId: req.user?.id ?? null,
    viewerRole: req.user?.role ?? null,
    viewerStatus: req.user?.status ?? null,
    viewerEmailVerified: req.user?.emailVerifiedAt !== null && req.user !== undefined,
  };
}

/**
 * Loads favourites and seller reputation for a whole page in two queries,
 * instead of N+1 per row.
 */
export async function buildProductContext(
  products: readonly Pick<Product, "id" | "sellerId">[],
  req: AuthRequest,
): Promise<ViewerContext> {
  const base = viewerFrom(req);
  const viewerId = base.viewerId;

  const [favoriteRows, aggregates] = await Promise.all([
    viewerId
      ? prisma.favorite.findMany({
          where: { userId: viewerId, productId: { in: products.map((p) => p.id) } },
          select: { productId: true },
        })
      : Promise.resolve([]),
    loadSellerAggregates(products.map((p) => p.sellerId)),
  ]);

  return {
    ...base,
    favorited: new Set(favoriteRows.map((row) => row.productId)),
    aggregates,
  };
}

export interface CategoryChain {
  /** Root-to-leaf display names, empty when the category does not exist. */
  path: string[];
  exists: boolean;
  /** Leaf and every ancestor are ACTIVE (detail-project 9.1). */
  active: boolean;
  /** Only a leaf category may hold a product (detail-project 9.3). */
  isLeaf: boolean;
}

export async function loadCategoryChain(categoryId: string): Promise<CategoryChain> {
  const rows = await prisma.$queryRaw<Array<Pick<Category, "id" | "parentId" | "name" | "status"> & { isLeaf: boolean }>>`
    WITH RECURSIVE chain AS (
      SELECT id, "parentId", name, status
      FROM "Category" WHERE id = ${categoryId}
      UNION
      SELECT c.id, c."parentId", c.name, c.status
      FROM "Category" c
      JOIN chain ON c.id = chain."parentId"
    )
    SELECT id, "parentId", name, status,
      NOT EXISTS (SELECT 1 FROM "Category" child WHERE child."parentId" = ${categoryId}) AS "isLeaf"
    FROM chain
    ORDER BY name
  `;

  if (rows.length === 0) {
    return { path: [], exists: false, active: false, isLeaf: false };
  }

  const byId = new Map(rows.map((row) => [row.id, row]));
  const leaf = byId.get(categoryId)!;

  // Walk parents up to the root to recover the real order.
  const ordered: typeof rows = [];
  let cursor: (typeof rows)[number] | undefined = leaf;
  const guard = new Set<string>();
  while (cursor && !guard.has(cursor.id)) {
    guard.add(cursor.id);
    ordered.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }

  return {
    path: ordered.map((row) => row.name),
    exists: true,
    active: cursor === undefined && ordered[0]?.parentId === null && ordered.every((row) => row.status === "ACTIVE"),
    isLeaf: leaf.isLeaf,
  };
}

/** Active leaf ids whose complete ancestor chain is ACTIVE. */
export async function activeCategoryIds(): Promise<Set<string>> {
  const all = await prisma.category.findMany({ select: { id: true, parentId: true, status: true } });
  const byId = new Map(all.map((row) => [row.id, row]));
  const withChildren = new Set(all.flatMap((row) => row.parentId ? [row.parentId] : []));
  const active = new Set<string>();

  for (const row of all) {
    if (row.status !== "ACTIVE" || withChildren.has(row.id)) continue;
    let cursor = row.parentId;
    let ok = true;
    const guard = new Set<string>([row.id]);
    while (cursor) {
      if (guard.has(cursor)) {
        ok = false;
        break;
      }
      guard.add(cursor);
      const parent = byId.get(cursor);
      if (!parent || parent.status !== "ACTIVE") {
        ok = false;
        break;
      }
      cursor = parent.parentId;
    }
    if (ok) active.add(row.id);
  }
  return active;
}
