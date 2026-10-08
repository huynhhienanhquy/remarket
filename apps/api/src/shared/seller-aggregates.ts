import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma.js";

/**
 * Seller reputation is derived, never stored (detail-project 7.1): rating and
 * review count come from non-hidden reviews, completed sales from COMPLETED
 * orders. Hidden reviews are excluded from the aggregate (detail-project 14.1).
 */
export interface SellerAggregates {
  /** NULL when the seller has no visible review yet. */
  rating: number | null;
  review_count: number;
  completed_sales_count: number;
}

export const EMPTY_AGGREGATES: SellerAggregates = {
  rating: null,
  review_count: 0,
  completed_sales_count: 0,
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Batch reputation loader: one fresh SQL query, without caching hidden reviews. */
export async function loadSellerAggregates(
  sellerIds: readonly string[],
): Promise<Map<string, SellerAggregates>> {
  const ids = [...new Set(sellerIds)].filter((id) => id.length > 0);
  const result = new Map<string, SellerAggregates>();
  if (ids.length === 0) return result;

  const rows = await prisma.$queryRaw<Array<{ id: string; rating: number | null; review_count: bigint; completed_sales_count: bigint }>>(Prisma.sql`
    WITH sellers(id) AS (VALUES ${Prisma.join(ids.map((id) => Prisma.sql`(${id}::text)`))})
    SELECT s.id, reviews.rating, reviews.count AS review_count, sales.count AS completed_sales_count
    FROM sellers s
    CROSS JOIN LATERAL (
      SELECT AVG(rating)::double precision AS rating, COUNT(*) AS count FROM "Review"
      WHERE "reviewedUserId" = s.id AND "hiddenAt" IS NULL
    ) reviews
    CROSS JOIN LATERAL (
      SELECT COUNT(*) AS count FROM "Order" WHERE "sellerId" = s.id AND status = 'COMPLETED'
    ) sales`);
  for (const row of rows) result.set(row.id, {
    rating: row.rating === null ? null : round1(row.rating),
    review_count: Number(row.review_count), completed_sales_count: Number(row.completed_sales_count),
  });

  return result;
}

export async function loadSellerAggregate(userId: string): Promise<SellerAggregates> {
  const map = await loadSellerAggregates([userId]);
  return map.get(userId) ?? { ...EMPTY_AGGREGATES };
}
