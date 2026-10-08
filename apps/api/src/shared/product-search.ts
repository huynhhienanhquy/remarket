import { Prisma } from "@prisma/client";
import type { Condition, DeliveryMethod, ProductListItem, SortOption } from "@remarket/shared";
import { prisma } from "../utils/prisma.js";
import { toProductListItem } from "./dto-mappers.js";
import type { ProductListRow, ViewerContext } from "./dto-mappers.js";

export interface ProductSearch {
  keyword: string;
  categoryId?: string;
  condition?: Condition;
  provinceCode?: string;
  deliveryMethod?: DeliveryMethod;
  minPrice: string | null;
  maxPrice: string | null;
  sort: SortOption;
  offset: number;
  limit: number;
}

type SearchRow = Omit<ProductListRow, "images" | "seller"> & {
  total: bigint;
  imageUrl: string | null;
  imagePath: string | null;
  sellerName: string;
  sellerAvatar: string | null;
  sellerProvince: string | null;
  sellerJoinedAt: Date;
  sellerVerifiedAt: Date;
  rating: number | null;
  reviewCount: bigint;
  completedSalesCount: bigint;
  favorited: boolean;
};

/** One snapshot/round-trip, with no stale category, visibility or identity cache. */
export async function searchPublicProducts(input: ProductSearch, viewer: Omit<ViewerContext, "aggregates" | "favorited">): Promise<{ items: ProductListItem[]; total: number }> {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`p.status = 'ACTIVE' AND p."deletedAt" IS NULL AND NOT p."isBlocked"`,
    Prisma.sql`u.status = 'ACTIVE' AND u."emailVerifiedAt" IS NOT NULL`,
    Prisma.sql`p."categoryId" IN (SELECT id FROM active_categories)
      AND NOT EXISTS (SELECT 1 FROM "Category" child WHERE child."parentId" = p."categoryId")`,
  ];
  if (input.categoryId !== undefined) conditions.push(Prisma.sql`p."categoryId" IN (SELECT id FROM selected_categories)`);
  if (input.keyword !== "") conditions.push(Prisma.sql`(
    strpos(lower(p.title), lower(${input.keyword})) > 0
    OR strpos(lower(p.description), lower(${input.keyword})) > 0
    OR p."categoryId" IN (SELECT id FROM matching_categories))`);
  if (input.condition) conditions.push(Prisma.sql`p.condition = ${input.condition}::"Condition"`);
  if (input.provinceCode) conditions.push(Prisma.sql`p."provinceCode" = ${input.provinceCode}`);
  if (input.minPrice !== null) conditions.push(Prisma.sql`p.price >= ${input.minPrice}::numeric`);
  if (input.maxPrice !== null) conditions.push(Prisma.sql`p.price <= ${input.maxPrice}::numeric`);
  if (input.deliveryMethod === "BOTH") conditions.push(Prisma.sql`p."deliveryMethod" = 'BOTH'`);
  else if (input.deliveryMethod) conditions.push(Prisma.sql`p."deliveryMethod" IN (${input.deliveryMethod}::"DeliveryMethod", 'BOTH')`);
  const sort = input.sort === "price_asc" ? Prisma.sql`p.price ASC, p.id ASC`
    : input.sort === "price_desc" ? Prisma.sql`p.price DESC, p.id ASC`
      : Prisma.sql`p."publishedAt" DESC NULLS LAST, p.id DESC`;

  // Only static SQL identifiers are interpolated; all filters/viewer IDs are parameters.
  const rows = await prisma.$queryRaw<Array<SearchRow | { id: null; total: bigint }>>(Prisma.sql`
    WITH RECURSIVE active_categories AS (
      SELECT id FROM "Category" WHERE "parentId" IS NULL AND status = 'ACTIVE'
      UNION
      SELECT c.id FROM "Category" c JOIN active_categories a ON c."parentId" = a.id WHERE c.status = 'ACTIVE'
    ), selected_categories AS (
      SELECT id FROM "Category" WHERE id = ${input.categoryId ?? null}
      UNION
      SELECT c.id FROM "Category" c JOIN selected_categories a ON c."parentId" = a.id
    ), matching_categories AS (
      SELECT id FROM "Category" WHERE ${input.keyword} <> '' AND strpos(lower(name), lower(${input.keyword})) > 0
      UNION
      SELECT c.id FROM "Category" c JOIN matching_categories a ON c."parentId" = a.id
    ), filtered AS MATERIALIZED (
      SELECT p.id FROM "Product" p JOIN "User" u ON u.id = p."sellerId"
      WHERE ${Prisma.join(conditions, " AND ")}
    ), page AS MATERIALIZED (
      SELECT p.* FROM "Product" p JOIN filtered f ON f.id = p.id
      ORDER BY ${sort} LIMIT ${input.limit} OFFSET ${input.offset}
    ), sellers AS (SELECT DISTINCT "sellerId" FROM page), reviews AS (
      SELECT "reviewedUserId", AVG(rating)::double precision AS rating, COUNT(*) AS count
      FROM "Review" WHERE "hiddenAt" IS NULL AND "reviewedUserId" IN (SELECT "sellerId" FROM sellers)
      GROUP BY "reviewedUserId"
    ), sales AS (
      SELECT "sellerId", COUNT(*) AS count FROM "Order"
      WHERE status = 'COMPLETED' AND "sellerId" IN (SELECT "sellerId" FROM sellers) GROUP BY "sellerId"
    )
    SELECT totals.total, p.id, p.title, p.price, p.condition, p.status, p."provinceCode", p."sellerId",
      p."publishedAt", p."createdAt", p."isBlocked", p."deletedAt",
      image.url AS "imageUrl", image."storagePath" AS "imagePath",
      u."fullName" AS "sellerName", u."avatarUrl" AS "sellerAvatar",
      u."provinceCode" AS "sellerProvince", u."joinedAt" AS "sellerJoinedAt", u."emailVerifiedAt" AS "sellerVerifiedAt",
      reviews.rating, COALESCE(reviews.count, 0) AS "reviewCount", COALESCE(sales.count, 0) AS "completedSalesCount",
      EXISTS (SELECT 1 FROM "Favorite" f WHERE f."userId" = ${viewer.viewerId} AND f."productId" = p.id) AS favorited
    FROM (SELECT COUNT(*) AS total FROM filtered) totals
    LEFT JOIN page p ON true LEFT JOIN "User" u ON u.id = p."sellerId"
    LEFT JOIN LATERAL (
      SELECT url, "storagePath" FROM "ProductImage" WHERE "productId" = p.id ORDER BY "sortOrder" ASC, id ASC LIMIT 1
    ) image ON true
    LEFT JOIN reviews ON reviews."reviewedUserId" = p."sellerId"
    LEFT JOIN sales ON sales."sellerId" = p."sellerId"
    ORDER BY ${sort}
  `);
  const items = rows.flatMap((row) => {
    if (row.id === null) return [];
    const product: ProductListRow = {
      id: row.id, sellerId: row.sellerId, title: row.title, price: row.price, condition: row.condition,
      provinceCode: row.provinceCode, publishedAt: row.publishedAt, createdAt: row.createdAt,
      status: row.status, isBlocked: row.isBlocked, deletedAt: row.deletedAt,
      images: row.imageUrl === null ? [] : [{ url: row.imageUrl, storagePath: row.imagePath, sortOrder: 0 }],
      seller: { id: row.sellerId, fullName: row.sellerName, avatarUrl: row.sellerAvatar, provinceCode: row.sellerProvince, joinedAt: row.sellerJoinedAt, status: "ACTIVE", emailVerifiedAt: row.sellerVerifiedAt },
    };
    const ctx: ViewerContext = {
      ...viewer,
      favorited: new Set(row.favorited ? [row.id] : []),
      aggregates: new Map([[row.sellerId, {
        rating: row.rating === null ? null : Math.round(row.rating * 10) / 10,
        review_count: Number(row.reviewCount), completed_sales_count: Number(row.completedSalesCount),
      }]]),
    };
    return [toProductListItem(product, ctx)];
  });
  return { items, total: Number(rows[0]?.total ?? 0) };
}
