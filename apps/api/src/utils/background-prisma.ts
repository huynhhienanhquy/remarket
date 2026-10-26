import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";
import { createDatabaseClient } from "./database-client.js";

const globalClients = globalThis as unknown as { backgroundPrisma?: PrismaClient };
const url = new URL(env.backgroundDatabaseUrl);
// Background work cannot borrow the HTTP request pool or inherit its URL limit.
url.searchParams.set("connection_limit", String(env.backgroundDatabaseConnectionLimit));
export const backgroundPrisma = globalClients.backgroundPrisma ?? createDatabaseClient({
  url: url.toString(), connectionLimit: env.backgroundDatabaseConnectionLimit,
  driver: env.databaseDriverAdapter, applicationName: "remarket-background",
  transactionOptions: { maxWait: env.databaseTransactionMaxWaitMs, timeout: env.databaseTransactionTimeoutMs },
  log: ["error", "warn"],
});
if (!env.isProduction) globalClients.backgroundPrisma = backgroundPrisma;
