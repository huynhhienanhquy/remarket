import { Prisma } from "@prisma/client";
import { loadCategoryEligibility } from "./category-policy.js";

/** Caller holds Order locks. Product locks always follow Order, in ID order. */
export async function releaseReservedProducts(
  tx: Prisma.TransactionClient,
  orderId: string,
  options: { reactivate?: boolean } = {},
): Promise<void> {
  await tx.$queryRaw(Prisma.sql`
    SELECT "id" FROM "Product" WHERE "reservedOrderId" = ${orderId}
    ORDER BY "id" FOR UPDATE
  `);
  const products = await tx.product.findMany({
    where: { reservedOrderId: orderId, status: "RESERVED" },
    include: { seller: { select: { status: true, emailVerifiedAt: true } } },
    orderBy: { id: "asc" },
  });
  const categories = options.reactivate === false ? new Set<string>()
    : await loadCategoryEligibility(tx, [...new Set(products.map((row) => row.categoryId))], true);
  for (const product of products) {
    const sellable = options.reactivate !== false && product.deletedAt === null && !product.isBlocked
      && product.seller.status === "ACTIVE" && product.seller.emailVerifiedAt !== null
      && categories.has(product.categoryId);
    await tx.product.updateMany({
      where: { id: product.id, reservedOrderId: orderId, status: "RESERVED" },
      data: { status: sellable ? "ACTIVE" : "INACTIVE", reservedOrderId: null, version: { increment: 1 } },
    });
  }
}
