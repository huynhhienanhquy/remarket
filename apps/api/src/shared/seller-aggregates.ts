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

/** Batch loader so a page of N products costs at most two extra queries. */
export async function loadSellerAggregates(
  sellerIds: readonly string[],
): Promise<Map<string, SellerAggregates>> {
  const ids = [...new Set(sellerIds)].filter((id) => id.length > 0);
  const result = new Map<string, SellerAggregates>();
  if (ids.length === 0) return result;

  const [reviews, orders] = await Promise.all([
    prisma.review.groupBy({
      by: ["reviewedUserId"],
      where: { reviewedUserId: { in: ids }, hiddenAt: null },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ["sellerId"],
      where: { sellerId: { in: ids }, status: "COMPLETED" },
      _count: { _all: true },
    }),
  ]);

  for (const id of ids) result.set(id, { ...EMPTY_AGGREGATES });

  for (const row of reviews) {
    result.set(row.reviewedUserId, {
      rating: row._avg.rating === null ? null : round1(row._avg.rating),
      review_count: row._count._all,
      completed_sales_count: result.get(row.reviewedUserId)?.completed_sales_count ?? 0,
    });
  }

  for (const row of orders) {
    const current = result.get(row.sellerId) ?? { ...EMPTY_AGGREGATES };
    result.set(row.sellerId, { ...current, completed_sales_count: row._count._all });
  }

  return result;
}

export async function loadSellerAggregate(userId: string): Promise<SellerAggregates> {
  const map = await loadSellerAggregates([userId]);
  return map.get(userId) ?? { ...EMPTY_AGGREGATES };
}
