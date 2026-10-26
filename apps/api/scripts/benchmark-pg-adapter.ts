import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { env } from "../src/config/env.js";

// Read-only transport probe. Use the existing transaction URL; no fixtures,
// credentials, SQL parameters or account data are printed.
const url = new URL(env.databaseUrl);
const ca = readFileSync(new URL("../certs/supabase-ca-2021.crt", import.meta.url), "utf8");
const certificate = new X509Certificate(ca);
assert.equal(certificate.fingerprint256.replaceAll(":", "").toLowerCase(), "807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa");
url.searchParams.delete("sslmode");
const pool = new pg.Pool({ connectionString: url.toString(), max: 1, connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 10_000, application_name: "remarket-driver-probe", ssl: { ca, rejectUnauthorized: true } });
pool.on("error", () => console.error("Probe pool connection error"));
const client = new PrismaClient({ adapter: new PrismaPg(pool, { schema: url.searchParams.get("schema") ?? "public" }),
  transactionOptions: { timeout: 30_000, maxWait: 10_000 }, log: [{ level: "query", emit: "event" }] });
let statements = 0;
client.$on("query", () => { statements += 1; });
async function measure(label: string, action: () => Promise<unknown>) {
  const before = statements, start = performance.now();
  await action();
  console.log(JSON.stringify({ label, ms: Math.round(performance.now() - start), sql: statements - before }));
}
try {
  await measure("pg-adapter-first", () => client.$queryRaw`SELECT 1`);
  for (let run = 0; run < 3; run += 1) await measure("pg-adapter-warm", () => client.$queryRaw`SELECT 1`);
  await measure("pg-adapter-orm", async () => {
    const row = await client.product.findFirst({ select: { createdAt: true, price: true, condition: true } });
    assert.ok(row);
    assert.ok(row.createdAt instanceof Date);
    assert.equal(typeof row.price.toFixed(0), "string");
    assert.equal(typeof row.condition, "string");
  });
  await measure("pg-adapter-transaction", () => client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1`;
    await tx.$queryRaw`SELECT 2`;
  }));
  const rollback = new Error("deliberate read-only rollback");
  await assert.rejects(client.$transaction(async (tx) => { await tx.$queryRaw`SELECT 1`; throw rollback; }), (error) => error === rollback);
  await measure("pg-adapter-after-rollback", () => client.$queryRaw`SELECT 1`);
  console.log(JSON.stringify({ pool: { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount } }));
  const { rows: objects } = await pool.query<{ storagePath: string }>(`
    SELECT "storagePath" FROM "StorageObject"
    WHERE "storagePath" LIKE '%/product/%' AND "storagePath" NOT LIKE '%.webp'
    ORDER BY "storagePath" LIMIT 8`);
  const payload = JSON.stringify(objects.map((object) => ({ path: `${object.storagePath}.card.webp`, fallback: object.storagePath })));
  const sql = `SELECT r.path AS "requestedPath", image."storagePath", image.contents, image."mimeType"
    FROM jsonb_to_recordset($1::jsonb) AS r(path text, fallback text)
    CROSS JOIN LATERAL (
      SELECT s."storagePath", s.contents, s."mimeType" FROM "StorageObject" s
      WHERE s."storagePath" = r.path OR s."storagePath" = r.fallback
      ORDER BY (s."storagePath" = r.path) DESC LIMIT 1
    ) image`;
  type ImageRow = { requestedPath: string; contents: Uint8Array };
  let expected: Map<string, Buffer>;
  await measure("pg-direct-image-batch", async () => {
    const { rows } = await pool.query<ImageRow>(sql, [payload]);
    expected = new Map(rows.map((row) => [row.requestedPath, Buffer.from(row.contents)]));
    console.log(JSON.stringify({ images: rows.length, bytes: rows.reduce((sum, row) => sum + row.contents.byteLength, 0) }));
  });
  await measure("pg-adapter-image-batch", async () => {
    const rows = await client.$queryRawUnsafe<ImageRow[]>(sql, payload);
    for (const row of rows) assert.deepEqual(Buffer.from(row.contents), expected.get(row.requestedPath));
  });
} finally {
  await client.$disconnect();
  await pool.end();
}
