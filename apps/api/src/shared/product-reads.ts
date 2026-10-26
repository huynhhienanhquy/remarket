import { Prisma, type ProductImage, type ProductStatus } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import type { ProductDetailRow, SellerProfile, ViewerContext } from "./dto-mappers.js";

type Viewer = Omit<ViewerContext, "favorited" | "aggregates">;
type ReadScope = { kind: "detail"; id: string }
  | { kind: "own"; sellerId: string; status?: ProductStatus; offset: number; limit: number }
  | { kind: "seller"; sellerId: string; offset: number; limit: number };

type ReadRow = Omit<ProductDetailRow, "images" | "seller"> & {
  total: bigint;
  ownerExists: boolean;
  images: Array<Omit<ProductImage, "createdAt"> & { createdAt: string }>;
  sellerName: string;
  sellerAvatar: string | null;
  sellerProvince: string | null;
  sellerJoinedAt: Date;
  sellerStatus: SellerProfile["status"];
  sellerVerifiedAt: Date | null;
  categoryPath: string[];
  categoryActive: boolean;
  categoryIsLeaf: boolean;
  rating: number | null;
  reviewCount: bigint;
  completedSalesCount: bigint;
  favorited: boolean;
};

export interface ProductSnapshot {
  product: ProductDetailRow;
  context: ViewerContext;
  categoryPath: string[];
  categoryActive: boolean;
  categoryIsLeaf: boolean;
}

/** Page, count, category policy, images and viewer context share one snapshot.
 * No cross-request cache: moderation and favorites are checked on every read.
 * Money stays a PostgreSQL numeric at the driver boundary, never a JSON number.
 */
export async function readProducts(scope: ReadScope, viewer: Viewer): Promise<{
  items: ProductSnapshot[]; total: number; ownerExists: boolean;
}> {
  const conditions: Prisma.Sql[] = [];
  if (scope.kind === "detail") conditions.push(Prisma.sql`p.id = ${scope.id} AND p."deletedAt" IS NULL`);
  else conditions.push(Prisma.sql`p."sellerId" = ${scope.sellerId}`);
  if (scope.kind === "own" && scope.status) conditions.push(Prisma.sql`p.status = ${scope.status}::text::"ProductStatus"`);
  if (scope.kind === "seller") conditions.push(Prisma.sql`
    p.status IN ('ACTIVE', 'RESERVED', 'SOLD') AND p."deletedAt" IS NULL AND NOT p."isBlocked"
    AND u.status = 'ACTIVE' AND u."emailVerifiedAt" IS NOT NULL
    AND p."categoryId" IN (SELECT id FROM category_paths WHERE active)
    AND NOT EXISTS (SELECT 1 FROM "Category" child WHERE child."parentId" = p."categoryId")`);
  const ownerExists = scope.kind === "seller" ? Prisma.sql`EXISTS (
    SELECT 1 FROM "User" WHERE id = ${scope.sellerId} AND status = 'ACTIVE' AND "emailVerifiedAt" IS NOT NULL
  )` : Prisma.sql`true`;
  const rows = await prisma.$queryRaw<Array<ReadRow | { id: null; total: bigint; ownerExists: boolean }>>(Prisma.sql`
    WITH RECURSIVE category_paths AS (
      SELECT id, ARRAY[name]::text[] AS path, status = 'ACTIVE' AS active
      FROM "Category" WHERE "parentId" IS NULL
      UNION ALL
      SELECT c.id, a.path || c.name::text, a.active AND c.status = 'ACTIVE'
      FROM "Category" c JOIN category_paths a ON c."parentId" = a.id
    ), filtered AS MATERIALIZED (
      SELECT p.id FROM "Product" p JOIN "User" u ON u.id = p."sellerId"
      WHERE ${Prisma.join(conditions, " AND ")}
    ), page AS MATERIALIZED (
      SELECT p.* FROM "Product" p JOIN filtered f ON f.id = p.id
      ORDER BY p."createdAt" DESC, p.id DESC
      LIMIT ${scope.kind === "detail" ? 1 : scope.limit} OFFSET ${scope.kind === "detail" ? 0 : scope.offset}
    ), sellers AS (SELECT DISTINCT "sellerId" FROM page), reviews AS (
      SELECT "reviewedUserId", AVG(rating)::double precision AS rating, COUNT(*) AS count FROM "Review"
      WHERE "hiddenAt" IS NULL AND "reviewedUserId" IN (SELECT "sellerId" FROM sellers) GROUP BY "reviewedUserId"
    ), sales AS (
      SELECT "sellerId", COUNT(*) AS count FROM "Order"
      WHERE status = 'COMPLETED' AND "sellerId" IN (SELECT "sellerId" FROM sellers) GROUP BY "sellerId"
    )
    SELECT totals.total, ${ownerExists} AS "ownerExists",
      p.id, p.title, p.description, p.price, p.condition::text AS condition, p."usageMonths", p."categoryId",
      p."provinceCode", p."deliveryMethod"::text AS "deliveryMethod", p."shippingFee", p.status::text AS status,
      p.version, p."isBlocked", p."blockReason", p."rejectionReason", p."reservedOrderId", p."deletedAt",
      p."reviewedBy", p."reviewedAt", p."sellerId", p."createdAt", p."updatedAt", p."publishedAt",
      COALESCE(images.rows, '[]'::jsonb) AS images,
      u."fullName" AS "sellerName", u."avatarUrl" AS "sellerAvatar", u."provinceCode" AS "sellerProvince",
      u."joinedAt" AS "sellerJoinedAt", u.status::text AS "sellerStatus", u."emailVerifiedAt" AS "sellerVerifiedAt",
      COALESCE(category.path, ARRAY[]::text[]) AS "categoryPath", COALESCE(category.active, false) AS "categoryActive",
      NOT EXISTS (SELECT 1 FROM "Category" child WHERE child."parentId" = p."categoryId") AS "categoryIsLeaf",
      reviews.rating, COALESCE(reviews.count, 0) AS "reviewCount", COALESCE(sales.count, 0) AS "completedSalesCount",
      EXISTS (SELECT 1 FROM "Favorite" f WHERE f."productId" = p.id AND f."userId" = ${viewer.viewerId}) AS favorited
    FROM (SELECT COUNT(*) AS total FROM filtered) totals
    LEFT JOIN page p ON true LEFT JOIN "User" u ON u.id = p."sellerId"
    LEFT JOIN category_paths category ON category.id = p."categoryId"
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(to_jsonb(image) || jsonb_build_object('createdAt', image."createdAt" AT TIME ZONE 'UTC')
        ORDER BY image."sortOrder", image.id) AS rows
      FROM "ProductImage" image WHERE image."productId" = p.id
    ) images ON true
    LEFT JOIN reviews ON reviews."reviewedUserId" = p."sellerId"
    LEFT JOIN sales ON sales."sellerId" = p."sellerId"
    ORDER BY p."createdAt" DESC, p.id DESC
  `);
  const items = rows.flatMap((row): ProductSnapshot[] => {
    if (row.id === null) return [];
    const product: ProductDetailRow = {
      id: row.id, title: row.title, description: row.description, price: row.price, condition: row.condition,
      usageMonths: row.usageMonths, categoryId: row.categoryId, provinceCode: row.provinceCode,
      deliveryMethod: row.deliveryMethod, shippingFee: row.shippingFee, status: row.status, version: row.version,
      isBlocked: row.isBlocked, blockReason: row.blockReason, rejectionReason: row.rejectionReason,
      reservedOrderId: row.reservedOrderId, deletedAt: row.deletedAt, reviewedBy: row.reviewedBy, reviewedAt: row.reviewedAt,
      sellerId: row.sellerId, createdAt: row.createdAt, updatedAt: row.updatedAt, publishedAt: row.publishedAt,
      images: row.images.map((image) => ({ ...image, createdAt: new Date(image.createdAt) })),
      seller: { id: row.sellerId, fullName: row.sellerName, avatarUrl: row.sellerAvatar,
        provinceCode: row.sellerProvince, joinedAt: row.sellerJoinedAt, status: row.sellerStatus, emailVerifiedAt: row.sellerVerifiedAt },
    };
    return [{ product, categoryPath: row.categoryPath,
      categoryActive: row.categoryActive && row.categoryIsLeaf, categoryIsLeaf: row.categoryIsLeaf,
      context: { ...viewer, favorited: new Set(row.favorited ? [row.id] : []),
        aggregates: new Map([[row.sellerId, { rating: row.rating === null ? null : Math.round(row.rating * 10) / 10,
          review_count: Number(row.reviewCount), completed_sales_count: Number(row.completedSalesCount) }]]) } }];
  });
  return { items, total: Number(rows[0]?.total ?? 0), ownerExists: rows[0]?.ownerExists ?? false };
}
