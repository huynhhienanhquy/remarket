import { PrismaClient } from "@prisma/client";

/**
 * Read-only checks for invariants introduced by the repair migration.
 * Run against the direct PostgreSQL connection before `prisma migrate deploy`.
 */
const prisma = new PrismaClient();

const invariantChecks: Array<{ name: string; sql: string }> = [
  {
    name: "orphan product reservation",
    sql: `SELECT COUNT(*)::bigint AS count FROM "Product" p LEFT JOIN "Order" o ON o."id" = p."reservedOrderId" WHERE p."reservedOrderId" IS NOT NULL AND o."id" IS NULL`,
  },
  {
    name: "orphan product reviewer",
    sql: `SELECT COUNT(*)::bigint AS count FROM "Product" p LEFT JOIN "User" u ON u."id" = p."reviewedBy" WHERE p."reviewedBy" IS NOT NULL AND u."id" IS NULL`,
  },
  {
    name: "orphan review moderator",
    sql: `SELECT COUNT(*)::bigint AS count FROM "Review" r LEFT JOIN "User" u ON u."id" = r."hiddenBy" WHERE r."hiddenBy" IS NOT NULL AND u."id" IS NULL`,
  },
  {
    name: "duplicate product image sort order",
    sql: `SELECT COUNT(*)::bigint AS count FROM (SELECT 1 FROM "ProductImage" GROUP BY "productId", "sortOrder" HAVING COUNT(*) > 1) duplicate_rows`,
  },
  {
    name: "duplicate checkout seller order",
    sql: `SELECT COUNT(*)::bigint AS count FROM (SELECT 1 FROM "Order" WHERE "checkoutRequestId" IS NOT NULL GROUP BY "checkoutRequestId", "sellerId" HAVING COUNT(*) > 1) duplicate_rows`,
  },
  {
    name: "duplicate order product item",
    sql: `SELECT COUNT(*)::bigint AS count FROM (SELECT 1 FROM "OrderItem" GROUP BY "orderId", "productId" HAVING COUNT(*) > 1) duplicate_rows`,
  },
  {
    name: "invalid product values",
    sql: `SELECT COUNT(*)::bigint AS count FROM "Product" WHERE "price" <= 0 OR "price" > 1000000000 OR "shippingFee" < 0 OR "shippingFee" > 10000000 OR ("usageMonths" IS NOT NULL AND "usageMonths" < 0) OR "version" <= 0 OR (("status" = 'RESERVED') <> ("reservedOrderId" IS NOT NULL))`,
  },
  {
    name: "invalid product image sort order",
    sql: `SELECT COUNT(*)::bigint AS count FROM "ProductImage" WHERE "sortOrder" < 0 OR "sortOrder" > 7`,
  },
  {
    name: "invalid order values",
    sql: `SELECT COUNT(*)::bigint AS count FROM "Order" WHERE "subtotal" < 0 OR "shippingFee" < 0 OR "totalAmount" <> "subtotal" + "shippingFee" OR "buyerId" = "sellerId" OR "version" <= 0`,
  },
  {
    name: "invalid order item price",
    sql: `SELECT COUNT(*)::bigint AS count FROM "OrderItem" WHERE "price" <= 0`,
  },
  {
    name: "invalid review values",
    sql: `SELECT COUNT(*)::bigint AS count FROM "Review" WHERE "rating" < 1 OR "rating" > 5 OR "reviewerId" = "reviewedUserId"`,
  },
  {
    name: "invalid report target",
    sql: `SELECT COUNT(*)::bigint AS count FROM "Report" WHERE (("targetProductId" IS NOT NULL)::int + ("targetUserId" IS NOT NULL)::int) <> 1`,
  },
  {
    name: "duplicate pending product report",
    sql: `SELECT COUNT(*)::bigint AS count FROM (SELECT 1 FROM "Report" WHERE "status" = 'PENDING' AND "targetProductId" IS NOT NULL GROUP BY "reporterId", "targetProductId" HAVING COUNT(*) > 1) duplicate_rows`,
  },
  {
    name: "duplicate pending user report",
    sql: `SELECT COUNT(*)::bigint AS count FROM (SELECT 1 FROM "Report" WHERE "status" = 'PENDING' AND "targetUserId" IS NOT NULL GROUP BY "reporterId", "targetUserId" HAVING COUNT(*) > 1) duplicate_rows`,
  },
];

async function run(): Promise<void> {
  const baselineRows = await prisma.$queryRawUnsafe<Array<{ baselineExists: boolean }>>(
    `SELECT to_regclass('"User"') IS NOT NULL AS "baselineExists"`,
  );

  if (!baselineRows[0]?.baselineExists) {
    console.log("SKIP migration preflight: the baseline tables do not exist yet.");
    console.log("Migration preflight passed.");
    return;
  }

  const sessionColumnRows = await prisma.$queryRawUnsafe<Array<{ hasSessionId: boolean }>>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'AuthToken'
        AND column_name = 'sessionId'
    ) AS "hasSessionId"`,
  );

  const authTokenCheck = sessionColumnRows[0]?.hasSessionId
    ? {
        name: "invalid auth token session mapping",
        sql: `SELECT COUNT(*)::bigint AS count FROM "AuthToken" WHERE NOT (
          ("purpose" = 'REFRESH' AND "sessionId" IS NOT NULL)
          OR ("purpose" IN ('VERIFY_EMAIL', 'RESET_PASSWORD') AND "sessionId" IS NULL)
        )`,
      }
    : {
        name: "legacy refresh token without session mapping",
        sql: `SELECT COUNT(*)::bigint AS count FROM "AuthToken" WHERE "purpose" NOT IN ('VERIFY_EMAIL', 'RESET_PASSWORD')`,
      };

  let failed = false;
  const checks = [...invariantChecks, authTokenCheck];
  for (const check of checks) {
    const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(check.sql);
    const count = Number(rows[0]?.count ?? 0n);
    console.log(`${count === 0 ? "PASS" : "FAIL"} ${check.name}: ${count}`);
    if (count !== 0) failed = true;
  }

  if (failed) {
    throw new Error("Migration preflight failed; repair the listed rows before deploying migrations.");
  }

  console.log("Migration preflight passed.");
}

run()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
