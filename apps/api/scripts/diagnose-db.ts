import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";

// Read-only diagnostic: no URLs, credentials or user data are printed.
config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const client = new PrismaClient({ log: [] });
async function measure(label: string, task: () => Promise<unknown>) {
  const start = performance.now();
  try {
    await task();
    console.log(JSON.stringify({ label, ok: true, elapsed_ms: Math.round(performance.now() - start) }));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "UNKNOWN";
    console.log(JSON.stringify({ label, ok: false, code, elapsed_ms: Math.round(performance.now() - start) }));
  }
}
try {
  await measure("connection_and_first_query", () => client.$queryRaw`SELECT 1`);
  await measure("warm_query", () => client.$queryRaw`SELECT 1`);
  await measure("read_only_12_queries_default_transaction", () => client.$transaction(async (tx) => {
    for (let i = 0; i < 12; i++) await tx.$queryRaw`SELECT 1`;
  }, { timeout: 5_000 }));
  const { env } = await import("../src/config/env.js");
  await measure("read_only_12_queries_configured_transaction", () => client.$transaction(async (tx) => {
    for (let i = 0; i < 12; i++) await tx.$queryRaw`SELECT 1`;
  }, { timeout: env.databaseTransactionTimeoutMs, maxWait: env.databaseTransactionMaxWaitMs }));
} finally {
  await client.$disconnect();
}
