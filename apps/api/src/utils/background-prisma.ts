import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

const globalClients = globalThis as unknown as { backgroundPrisma?: PrismaClient };
const url = new URL(env.backgroundDatabaseUrl);
// Background work cannot borrow the HTTP request pool or inherit its URL limit.
url.searchParams.set("connection_limit", String(env.backgroundDatabaseConnectionLimit));
export const backgroundPrisma = globalClients.backgroundPrisma ?? new PrismaClient({
  datasources: { db: { url: url.toString() } },
  transactionOptions: { maxWait: env.databaseTransactionMaxWaitMs, timeout: env.databaseTransactionTimeoutMs },
  log: ["error", "warn"],
});
if (!env.isProduction) globalClients.backgroundPrisma = backgroundPrisma;
