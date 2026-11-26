import type { Product } from "@prisma/client";
import { categoryPathsSql } from "../services/category-policy.js";
import { prisma } from "../utils/prisma.js";
import type { SellerProfile } from "./dto-mappers.js";

export type CartAvailability = Pick<Product, "deletedAt" | "isBlocked" | "sellerId" | "status" | "categoryId"> & {
  seller: Pick<SellerProfile, "status" | "emailVerifiedAt">;
};

type CartRow = Omit<CartAvailability, "seller"> &
  Pick<Product, "id" | "deliveryMethod" | "shippingFee" | "title" | "price" | "condition" | "provinceCode"> & {
    total: bigint;
    categoryEligible: boolean;
    imageUrl: string | null;
    imagePath: string | null;
    sellerName: string;
    sellerAvatar: string | null;
    sellerProvince: string | null;
    sellerJoinedAt: Date;
    sellerStatus: SellerProfile["status"];
    sellerVerifiedAt: Date | null;
    rating: number | null;
    reviewCount: bigint;
    completedSalesCount: bigint;
  };

/** One fresh snapshot for the bounded cart, its full count and display metadata. */
export async function readCart(userId: string, limit: number) {
  const rows = await prisma.$queryRaw<Array<CartRow | { id: null; total: bigint }>>`
    WITH RECURSIVE category_paths AS (${categoryPathsSql}),
    cart AS MATERIALIZED (
      SELECT id, "productId", "createdAt" FROM "CartItem" WHERE "userId" = ${userId}
    ), page AS MATERIALIZED (
      SELECT p.id, p."sellerId", p."categoryId", p."deletedAt", p."isBlocked", p.status,
        p."deliveryMethod", p."shippingFee", p.title, p.price, p.condition, p."provinceCode",
        cart."createdAt" AS "addedAt", cart.id AS "cartId"
      FROM cart JOIN "Product" p ON p.id = cart."productId"
      ORDER BY cart."createdAt" DESC, cart.id DESC
      LIMIT ${limit}
    ), sellers AS (SELECT DISTINCT "sellerId" FROM page), reviews AS (
      SELECT "reviewedUserId", AVG(rating)::double precision AS rating, COUNT(*) AS count FROM "Review"
      WHERE "hiddenAt" IS NULL AND "reviewedUserId" IN (SELECT "sellerId" FROM sellers) GROUP BY "reviewedUserId"
    ), sales AS (
      SELECT "sellerId", COUNT(*) AS count FROM "Order"
      WHERE status = 'COMPLETED' AND "sellerId" IN (SELECT "sellerId" FROM sellers) GROUP BY "sellerId"
    )
    SELECT totals.total, p.id, p."sellerId", p."categoryId", p."deletedAt", p."isBlocked",
      p.status::text AS status, p."deliveryMethod"::text AS "deliveryMethod",
      p."shippingFee", p.title, p.price, p.condition::text AS condition, p."provinceCode",
      COALESCE(category.active, false)
        AND NOT EXISTS (SELECT 1 FROM "Category" child WHERE child."parentId" = p."categoryId") AS "categoryEligible",
      image.url AS "imageUrl", image."storagePath" AS "imagePath",
      u."fullName" AS "sellerName", u."avatarUrl" AS "sellerAvatar", u."provinceCode" AS "sellerProvince",
      u."joinedAt" AS "sellerJoinedAt", u.status::text AS "sellerStatus", u."emailVerifiedAt" AS "sellerVerifiedAt",
      reviews.rating, COALESCE(reviews.count, 0) AS "reviewCount", COALESCE(sales.count, 0) AS "completedSalesCount"
    FROM (SELECT COUNT(*) AS total FROM cart) totals
    LEFT JOIN page p ON true
    LEFT JOIN "User" u ON u.id = p."sellerId"
    LEFT JOIN category_paths category ON category.id = p."categoryId"
    LEFT JOIN LATERAL (
      SELECT url, "storagePath" FROM "ProductImage"
      WHERE "productId" = p.id ORDER BY "sortOrder" LIMIT 1
    ) image ON true
    LEFT JOIN reviews ON reviews."reviewedUserId" = p."sellerId"
    LEFT JOIN sales ON sales."sellerId" = p."sellerId"
    ORDER BY p."addedAt" DESC, p."cartId" DESC
  `;
  return { total: Number(rows[0]?.total ?? 0), items: rows.filter((row): row is CartRow => row.id !== null) };
}
