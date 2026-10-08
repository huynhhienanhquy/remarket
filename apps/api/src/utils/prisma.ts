import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const runtimeUrl = new URL(env.databaseRuntimeUrl);
if (!runtimeUrl.searchParams.has("connection_limit")) {
  runtimeUrl.searchParams.set("connection_limit", String(env.databaseConnectionLimit));
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: runtimeUrl.toString() } },
    // Remote PostgreSQL needs enough time for the atomic multi-query workflows.
    transactionOptions: {
      maxWait: env.databaseTransactionMaxWaitMs,
      timeout: env.databaseTransactionTimeoutMs,
    },
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
