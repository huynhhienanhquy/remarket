import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { createDatabaseClient } from "./database-client.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const runtimeUrl = new URL(env.databaseRuntimeUrl);
if (!runtimeUrl.searchParams.has("connection_limit")) {
  runtimeUrl.searchParams.set("connection_limit", String(env.databaseConnectionLimit));
}

export const prisma =
  globalForPrisma.prisma ??
  createDatabaseClient({
    url: runtimeUrl.toString(), connectionLimit: env.databaseConnectionLimit,
    driver: env.databaseDriverAdapter, applicationName: "remarket-http",
    // Remote PostgreSQL needs enough time for the atomic multi-query workflows.
    transactionOptions: {
      maxWait: env.databaseTransactionMaxWaitMs,
      timeout: env.databaseTransactionTimeoutMs,
    },
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Open the first two request connections before accepting traffic. Keep the
 * configured connection budget; startup absorbs TLS/authentication latency. */
export async function warmHttpDatabasePool(): Promise<void> {
  const configured = Number(runtimeUrl.searchParams.get("connection_limit"));
  const connections = Math.min(2, Number.isFinite(configured) && configured > 0 ? configured : env.databaseConnectionLimit);
  await Promise.all(Array.from({ length: connections }, () => prisma.$queryRaw`SELECT 1`));
}

export default prisma;
