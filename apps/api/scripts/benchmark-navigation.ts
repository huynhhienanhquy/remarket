import "dotenv/config";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import request from "supertest";
import { createDatabaseClient, disconnectDatabaseClient } from "../src/utils/database-client.js";

// Read-only GET benchmark against the configured database. Never logs tokens,
// connection strings, SQL parameters, response bodies or account identifiers.
// Existing live sessions let us measure the actual middleware without login,
// refresh rotation, fixture inserts or changes to application data.
const label = process.argv[2] ?? "navigation";
assert.match(label, /^[a-z-]+$/);
process.env.RUN_JOBS = "false";
const { env } = await import("../src/config/env.js");
const driver = process.argv.includes("--pg-adapter") ? "pg" : env.databaseDriverAdapter;
const url = new URL(process.argv.includes("--transaction-url") ? env.databaseUrl : env.databaseRuntimeUrl);
if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", String(env.databaseConnectionLimit));
if (process.argv.includes("--long-connect")) url.searchParams.set("connect_timeout", "15");
let statements = 0;
let queryMs = 0;
let productQuery: { query: string; params: string } | undefined;
const client = createDatabaseClient({
  url: url.toString(), driver, connectionLimit: env.databaseConnectionLimit, applicationName: "remarket-benchmark",
  transactionOptions: { maxWait: env.databaseTransactionMaxWaitMs, timeout: env.databaseTransactionTimeoutMs },
  log: [{ level: "query", emit: "event" }],
});
client.$on("query", (event) => {
  statements += 1;
  queryMs += event.duration;
  if (/^\s*(SELECT|WITH)\b/i.test(event.query) && event.query.includes('"Product"')) productQuery = { query: event.query, params: event.params };
});
(globalThis as { prisma?: PrismaClient }).prisma = client;
const { createApp } = await import("../src/app.js");
const { signAccessToken } = await import("../src/shared/tokens.js");
const app = createApp();
const results: Array<{ operation: string; status: number; ms: number; sql: number; query_ms: number }> = [];
const details: Array<Record<string, unknown>> = [];
function detail(value: Record<string, unknown>) {
  details.push(value);
  console.log(JSON.stringify(value));
}

async function sample(operation: string, path: string, token?: string) {
  const before = statements;
  const beforeMs = queryMs;
  const start = performance.now();
  const pending = request(app).get(path);
  if (token) pending.set("Authorization", `Bearer ${token}`);
  const response = await pending;
  const result = { operation, status: response.status, ms: Math.round(performance.now() - start), sql: statements - before, query_ms: queryMs - beforeMs };
  results.push(result);
  console.log(JSON.stringify(result));
  assert.equal(response.status, 200, `${operation}: HTTP ${response.status}`);
  return response;
}

try {
  if (process.argv.includes("--warm-pool")) {
    const { warmHttpDatabasePool } = await import("../src/utils/prisma.js");
    const started = performance.now();
    await warmHttpDatabasePool();
    detail({ operation: "startup-pool-warmup", ms: Math.round(performance.now() - started) });
  }
  detail({ configuration: {
    pool_limit: Number(url.searchParams.get("connection_limit")), driver,
    port: url.port || "5432", pgbouncer: url.searchParams.get("pgbouncer") === "true",
    storage: env.storage.driver, background_pool_limit: env.backgroundDatabaseConnectionLimit,
    jobs_in_api: env.runJobs,
  } });
  for (let i = 0; i < 3; i += 1) await sample(i || process.argv.includes("--warm-pool") ? "warm-db-roundtrip" : "cold-db-roundtrip", "/health/ready");
  const [plan] = await client.$queryRaw<Array<{ "QUERY PLAN": Array<{ "Execution Time": number; "Planning Time": number }> }>>`
    EXPLAIN (ANALYZE, FORMAT JSON) SELECT 1`;
  detail({ select_one_server: { execution_ms: plan?.["QUERY PLAN"][0]?.["Execution Time"], planning_ms: plan?.["QUERY PLAN"][0]?.["Planning Time"] } });
  if (process.argv.includes("--enum-probe")) {
    for (let run = 0; run < 2; run += 1) {
      for (const cast of [false, true]) {
        const before = statements, started = performance.now();
        const rows = cast ? await client.$queryRaw<Array<{ condition: string; status: string }>>`
          SELECT condition::text AS condition, status::text AS status FROM "Product" ORDER BY id LIMIT 1`
          : await client.$queryRaw<Array<{ condition: string; status: string }>>`
          SELECT condition, status FROM "Product" ORDER BY id LIMIT 1`;
        assert.ok(rows.length);
        detail({ operation: cast ? "enum-as-text" : "enum-native", run, sql: statements - before,
          ms: Math.round(performance.now() - started) });
      }
    }
  } else if (process.argv.includes("--product-reads")) {
    const catalogue = await sample("probe-products", "/api/v1/products?page_size=1");
    const product = catalogue.body.data.items[0] as { id: string; seller: { id: string } } | undefined;
    assert.ok(product, "Product read probe requires an existing public listing");
    const session = await client.session.findFirst({
      where: { revokedAt: null, expiresAt: { gt: new Date() }, user: { deletedAt: null, status: "ACTIVE", role: "USER" } },
      select: { id: true, userId: true },
    });
    const token = session ? signAccessToken(session.userId, session.id) : undefined;
    for (let run = 0; run < 4; run += 1) {
      await sample(`guest-detail-${run}`, `/api/v1/products/${product.id}`);
      await sample(`guest-seller-products-${run}`, `/api/v1/users/${product.seller.id}/products`);
      if (token) {
        await sample(`member-detail-${run}`, `/api/v1/products/${product.id}`, token);
        await sample(`member-own-products-${run}`, "/api/v1/account/products", token);
        await sample(`member-seller-products-${run}`, `/api/v1/users/${product.seller.id}/products`, token);
      }
    }
  } else if (process.argv.includes("--catalog-images")) {
    const catalogue = await sample("catalogue-image-references", "/api/v1/products?page_size=10");
    const urls = (catalogue.body.data.items as Array<{ image_url: string | null }>).flatMap((item) => item.image_url ? [item.image_url] : []);
    const statuses: Record<string, number> = {};
    await Promise.all(urls.map(async (url) => {
      const response = await request(app).get(`${url}&variant=card`);
      const key = `${response.status}:${response.body.error?.code ?? response.headers["content-type"] ?? "unknown"}`;
      statuses[key] = (statuses[key] ?? 0) + 1;
    }));
    detail({ operation: "catalogue-image-statuses", references: urls.length, statuses });
  } else if (process.argv.includes("--bootstrap")) {
    const { discoverRefreshState, lockRefreshState } = await import("../src/services/refresh-locks.js");
    const credential = await client.authToken.findFirst({
      where: { purpose: "REFRESH", consumedAt: null, expiresAt: { gt: new Date() },
        session: { revokedAt: null, expiresAt: { gt: new Date() }, transport: "WEB" }, user: { deletedAt: null } },
      select: { tokenHash: true, id: true, userId: true, sessionId: true },
    });
    assert.ok(credential?.sessionId, "An existing current web session is required; no credentials are created");
    for (let run = 0; run < 4; run += 1) {
      for (const compact of [false, true]) {
        const before = statements;
        const started = performance.now();
        let state: Awaited<ReturnType<typeof discoverRefreshState>>;
        if (compact) state = await discoverRefreshState(client, credential.tokenHash);
        else {
          await client.authToken.findUniqueOrThrow({ where: { tokenHash: credential.tokenHash } });
          state = await client.$transaction((tx): ReturnType<typeof lockRefreshState> => lockRefreshState(tx, {
            id: credential.id, userId: credential.userId, sessionId: credential.sessionId!,
          }));
        }
        assert.ok(state);
        assert.equal(state.session.id, credential.sessionId);
        assert.equal(state.token.consumedAt, null);
        assert.equal(state.session.refreshHash, credential.tokenHash);
        detail({ operation: compact ? "bootstrap-single-statement" : "bootstrap-interactive-transaction",
          phase: run ? "warm" : "first-shapes", run, sql: statements - before, ms: Math.round(performance.now() - started) });
      }
    }
  } else if (process.argv.includes("--compare-navigation")) {
    const session = await client.session.findFirst({
      where: { revokedAt: null, expiresAt: { gt: new Date() }, user: { deletedAt: null, status: "ACTIVE", role: "USER" } },
      select: { id: true, userId: true },
    });
    assert.ok(session, "Comparison requires an existing live USER session; no fixture is created");
    const token = signAccessToken(session.userId, session.id);
    for (let run = 0; run < 4; run += 1) {
      for (const compact of [false, true]) {
        const paths = compact ? ["/products", "/notifications/navigation-counts"]
          : ["/products", "/cart", "/notifications/unread-count", "/conversations/unread-count"];
        const startCount = statements;
        const started = performance.now();
        await Promise.all(paths.map(async (path) => {
          const response = await request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${token}`);
          assert.equal(response.status, 200, path);
        }));
        detail({ operation: compact ? "compact-header-page" : "legacy-header-page", phase: run ? "warm" : "first-shapes", run,
          requests: paths.length, sql: statements - startCount, ms: Math.round(performance.now() - started) });
      }
    }
  } else if (process.argv.includes("--image-burst")) {
    assert.equal(env.storage.driver, "database");
    const { createPrivateStorageUrl, readDatabaseStorageObject, imageVariantPath } = await import("../src/services/storage.js");
    const objects = await client.storageObject.findMany({
      where: { storagePath: { contains: "/product/", not: { endsWith: ".webp" } } },
      select: { storagePath: true }, take: 8, orderBy: { storagePath: "asc" },
    });
    assert.ok(objects.length > 0);
    for (let wave = 0; wave < 2; wave += 1) {
      const before = statements, beforeQueryMs = queryMs, started = performance.now();
      const legacy = process.argv.includes("--legacy-image-burst");
      const responses = await Promise.all(objects.map(async (object, index) => {
        if (legacy) {
          // Reproduce separate HTTP arrival ticks; synchronous findUnique calls
          // would be automatically batched by Prisma and hide the old queue.
          await new Promise((resolve) => setTimeout(resolve, index * 2));
          const image = await readDatabaseStorageObject(imageVariantPath(object.storagePath, "card"))
            ?? await readDatabaseStorageObject(object.storagePath);
          assert.ok(image);
          return { ms: Math.round(performance.now() - started), bytes: image.contents.length };
        }
        const response = await request(app).get(`${createPrivateStorageUrl(object.storagePath)}&variant=card`).expect(200);
        return { ms: Math.round(performance.now() - started), bytes: response.body.length as number };
      }));
      detail({ operation: legacy ? "legacy-card-byte-burst" : "card-image-burst", wave, images: objects.length, sql: statements - before,
        ms: Math.round(performance.now() - started), query_ms: queryMs - beforeQueryMs, response_ms: responses.map((row) => row.ms),
        bytes: responses.reduce((sum, row) => sum + row.bytes, 0) });
    }
  } else if (process.argv.includes("--images")) {
    assert.equal(env.storage.driver, "database", "Image probe requires database storage");
    const { createPrivateStorageUrl } = await import("../src/services/storage.js");
    const objects = await client.storageObject.findMany({ select: { storagePath: true }, take: 6, orderBy: { storagePath: "asc" } });
    for (let wave = 0; wave < 2; wave += 1) {
      for (const [index, object] of objects.entries()) await sample(`image-wave-${wave + 1}-${index + 1}`, createPrivateStorageUrl(object.storagePath));
    }
    // Concurrent duplicate requests reproduce multiple mounted image elements.
    if (objects[0]) {
      const before = statements;
      const start = performance.now();
      await Promise.all(Array.from({ length: 4 }, () => request(app).get(createPrivateStorageUrl(objects[0]!.storagePath)).expect(200)));
      detail({ operation: "four-duplicate-images", ms: Math.round(performance.now() - start), sql: statements - before });
    }
  } else if (process.argv.includes("--plans")) {
    const session = await client.session.findFirst({
      where: { revokedAt: null, expiresAt: { gt: new Date() }, user: { deletedAt: null, status: "ACTIVE", role: "USER" } },
      select: { id: true, userId: true },
    });
    for (const path of ["/products", "/account/products"]) {
      if (path === "/account/products" && !session) continue;
      productQuery = undefined;
      await sample(`plan ${path}`, `/api/v1${path}`, session ? signAccessToken(session.userId, session.id) : undefined);
      const captured = productQuery as { query: string; params: string } | undefined;
      if (!captured) continue;
      const parameters: unknown = JSON.parse(captured.params);
      assert.ok(Array.isArray(parameters));
      const [explain] = await client.$queryRawUnsafe<Array<{ "QUERY PLAN": Array<{ "Execution Time": number; "Planning Time": number }> }>>(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${captured.query}`, ...parameters,
      );
      const plan = explain?.["QUERY PLAN"][0];
      detail({ operation: `server-plan ${path}`, execution_ms: plan?.["Execution Time"], planning_ms: plan?.["Planning Time"] });
    }
  } else {
    const sessions = await client.session.findMany({
      where: { revokedAt: null, expiresAt: { gt: new Date() }, user: { deletedAt: null, status: "ACTIVE" } },
      select: { id: true, userId: true, user: { select: { role: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    });
    const catalogue = await sample("public-products", "/api/v1/products?page_size=10");
    const product = catalogue.body.data.items[0] as { id: string; seller: { id: string } } | undefined;
    const publicPaths = ["/api/v1/categories", "/api/v1/provinces"];
    if (product) publicPaths.push(`/api/v1/products/${product.id}`, `/api/v1/users/${product.seller.id}`, `/api/v1/users/${product.seller.id}/products`, `/api/v1/users/${product.seller.id}/reviews`);
    for (const path of publicPaths) await sample(path.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id"), path);
    for (const role of ["USER", "ADMIN"] as const) {
      const session = sessions.find((row) => row.user.role === role);
      if (!session) { detail({ skipped_role: role, reason: "no live session; no data created" }); continue; }
      const token = signAccessToken(session.userId, session.id);
      const paths = role === "ADMIN"
        ? ["/admin/dashboard", "/admin/products", "/admin/users", "/admin/categories", "/admin/reports", "/admin/reviews", "/admin/support-tickets", "/admin/audit-logs", "/admin/email-verifications"]
        : ["/auth/me", "/products", "/cart", "/notifications/unread-count", "/conversations/unread-count", "/orders", "/account/products", "/favorites", "/notifications", "/conversations", "/support/tickets"];
      for (const path of paths) await sample(`${role} ${path}`, `/api/v1${path}`, token);
      if (role === "USER") {
        const before = statements;
        const start = performance.now();
        const batch = await Promise.all(["/products", "/notifications/navigation-counts"].map(async (path) => {
          const started = performance.now();
          const response = await request(app).get(`/api/v1${path}`).set("Authorization", `Bearer ${token}`);
          assert.equal(response.status, 200);
          return { path, ms: Math.round(performance.now() - started) };
        }));
        detail({ operation: "member-page-with-header", ms: Math.round(performance.now() - start), sql: statements - before, requests: batch });
      }
    }
  }
} finally {
  await disconnectDatabaseClient(client);
  const dir = fileURLToPath(new URL("../../../.artifacts/performance/", import.meta.url));
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}${label}.json`, JSON.stringify(results, null, 2));
  await writeFile(`${dir}${label}-details.json`, JSON.stringify(details, null, 2));
}
