import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import request from "supertest";

const label = process.argv[2] ?? "public";
assert.match(label, /^[a-z-]+$/);
process.env.RUN_JOBS = "false";
const { env } = await import("../src/config/env.js");
const url = new URL(env.databaseRuntimeUrl);
if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", String(env.databaseConnectionLimit));
let statements = 0;
const client = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [{ level: "query", emit: "event" }] });
client.$on("query", () => { statements += 1; });
(globalThis as unknown as { prisma: PrismaClient }).prisma = client;
const { createApp } = await import("../src/app.js");
const app = createApp();
const results: Array<{ path: string; phase: string; concurrent: number; sql_statements: number; ms: number[] }> = [];
try {
  const capacity = await client.$queryRaw<Array<{ max_connections: number; active_connections: bigint }>>`
    SELECT current_setting('max_connections')::int AS max_connections,
           (SELECT COUNT(*) FROM pg_stat_activity) AS active_connections`;
  console.log(JSON.stringify({ database_capacity: capacity.map((row) => ({ ...row, active_connections: Number(row.active_connections) })) }));
  let parallelRuns = 0;
  for (const [path, concurrent] of [["/health/live", 1], ["/health/ready", 1], ["/api/v1/products", 1], ["/api/v1/products?q=laptop", 1], ["/api/v1/products", 5], ["/api/v1/products", 5]] as const) {
    const samples: number[] = [];
    const startCount = statements;
    const sample = async () => {
      const start = performance.now();
      const response = await request(app).get(path);
      samples.push(Math.round(performance.now() - start));
      assert.equal(response.status, 200, `${path} failed: ${response.body.error?.code}`);
    };
    if (concurrent === 1) { for (let i = 0; i < 3; i += 1) await sample(); }
    else await Promise.all(Array.from({ length: concurrent }, sample));
    const phase = concurrent === 1 ? "sequential" : parallelRuns++ === 0 ? "parallel-initial" : "parallel-warm";
    const result = { path, phase, concurrent, sql_statements: statements - startCount, ms: samples };
    results.push(result);
    console.log(JSON.stringify(result));
  }
} finally {
  await client.$disconnect();
}
const dir = fileURLToPath(new URL("../../../.artifacts/performance/", import.meta.url));
await mkdir(dir, { recursive: true });
await writeFile(`${dir}${label}.json`, JSON.stringify(results, null, 2));
