import { Prisma, PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import request from "supertest";
import assert from "node:assert/strict";

config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
const label = process.argv[2] ?? "baseline";
const results: Array<{ operation: string; ms: number; sql_statements?: number; status?: number }> = [];
async function time<T>(operation: string, action: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await action();
  const row = { operation, ms: Math.round(performance.now() - start) };
  results.push(row); console.log(JSON.stringify(row));
  return result;
}
if (label.startsWith("connections")) {
  for (const [name, value] of [["runtime", process.env.DATABASE_URL], ["migration_or_session", process.env.DIRECT_URL]] as const) {
    if (!value) continue;
    const url = new URL(value);
    url.searchParams.set("connection_limit", "2");
    console.log(JSON.stringify({ connection: name, port: url.port, options: Object.fromEntries([...url.searchParams].filter(([key]) => ["pgbouncer", "connection_limit", "sslmode", "connect_timeout", "statement_cache_size"].includes(key))) }));
    const client = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [{ level: "query", emit: "event" }] });
    client.$on("query", (event) => console.log(JSON.stringify({ connection: name, statement: event.query.split(/\s+/)[0], duration_ms: event.duration })));
    const started = performance.now();
    try {
      await time(`${name}_connect`, () => client.$queryRaw`SELECT 1`);
      for (let i = 1; i <= 3; i++) await time(`${name}_warm_${i}`, () => client.$queryRaw`SELECT 1`);
    } catch {
      // Do not dump connection strings or Prisma's long initialization stack.
      const row = { operation: `${name}_unavailable`, ms: Math.round(performance.now() - started), status: 503 };
      results.push(row); console.log(JSON.stringify(row));
    } finally { await client.$disconnect(); }
  }
} else {
  process.env.NODE_ENV = "test";
  process.env.RUN_JOBS = "false";
  const { env } = await import("../src/config/env.js");
  let queryCount = 0;
  const runtimeUrl = new URL(env.databaseRuntimeUrl);
  if (!runtimeUrl.searchParams.has("connection_limit")) runtimeUrl.searchParams.set("connection_limit", String(env.databaseConnectionLimit));
  const client = new PrismaClient({
    datasources: { db: { url: runtimeUrl.toString() } },
    log: [{ level: "query", emit: "event" }],
    transactionOptions: { timeout: env.databaseTransactionTimeoutMs, maxWait: env.databaseTransactionMaxWaitMs },
  });
  client.$on("query", () => { queryCount += 1; });
  // Isolated process uses the actual application client, without starting jobs.
  (globalThis as unknown as { prisma: PrismaClient }).prisma = client;
  const { createApp } = await import("../src/app.js");
  const app = createApp();
  let cookie = "";
  let access = "";
  const run = async (operation: string, method: "get" | "post", endpoint: string, body?: unknown) => {
    const startCount = queryCount;
    const response = await time(operation, async () => {
      const pending = request(app)[method](endpoint).set("Origin", "http://localhost:5173");
      if (cookie) pending.set("Cookie", cookie);
      if (access) pending.set("Authorization", `Bearer ${access}`);
      if (body) pending.send(body);
      return pending;
    });
    const row = results.at(-1)!;
    row.sql_statements = queryCount - startCount;
    row.status = response.status;
    if (response.status !== 200) throw new Error(`${operation}: ${response.status} ${response.body.error?.code ?? "unknown"}`);
    if (response.body.data?.access_token) access = response.body.data.access_token;
    if (response.headers["set-cookie"]?.[0]) cookie = response.headers["set-cookie"][0].split(";")[0]!;
    console.log(JSON.stringify({ operation, sql_statements: row.sql_statements, status: row.status }));
    return response;
  };
  try {
    if (label === "security") {
      await run("login_for_rotation", "post", "/api/v1/auth/login", { email: "admin@remarket.vn", password: "remarket-demo-2026" });
      const originalCookie = cookie;
      const { sha256, newRefreshToken } = await import("../src/shared/tokens.js");
      const originalHash = sha256(decodeURIComponent(originalCookie.slice(originalCookie.indexOf("=") + 1)));
      const initial = await client.authToken.findUniqueOrThrow({ where: { tokenHash: originalHash } });
      assert(initial.sessionId);
      const { createSession, rotateSessionRecords } = await import("../src/services/session-issuance.js");
      // Conflict injection affects only this script's own test token ID.
      let attemptedSessionId = "";
      function collisionClient(tx: Prisma.TransactionClient, tokenIndex: number, captureSession = false) {
        return new Proxy(tx, { get(target, key, receiver) {
          if (key !== "$executeRaw") return Reflect.get(target, key, receiver);
          return (sql: TemplateStringsArray, ...values: unknown[]) => {
            if (captureSession) attemptedSessionId = String(values[0]);
            values[tokenIndex] = initial.id;
            return target.$executeRaw(sql, ...values);
          };
        } });
      }
      const uniqueConflict = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError
        && error.code === "P2010" && error.meta?.code === "23505";
      await assert.rejects(createSession(collisionClient(client, 5, true), initial.userId), uniqueConflict);
      assert.equal(await client.session.findUnique({ where: { id: attemptedSessionId } }), null, "Failed token insert must roll back the session insert");
      const sessionBefore = await client.session.findUniqueOrThrow({ where: { id: initial.sessionId } });
      await assert.rejects(client.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${initial.userId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "Session" WHERE "id" = ${initial.sessionId} FOR UPDATE`;
        await tx.$queryRaw`SELECT "id" FROM "AuthToken" WHERE "id" = ${initial.id} FOR UPDATE`;
        await rotateSessionRecords(collisionClient(tx, 2), {
          tokenId: initial.id, sessionId: initial.sessionId!, presentedHash: originalHash,
          nextHash: sha256(newRefreshToken()), now: new Date(), expiresAt: sessionBefore.expiresAt,
        });
      }), uniqueConflict);
      assert.deepEqual(await client.authToken.findUnique({ where: { id: initial.id } }), initial, "Failed replacement must not consume the original token");
      assert.deepEqual(await client.session.findUnique({ where: { id: initial.sessionId } }), sessionBefore, "Failed replacement must not change session hashes or dates");
      console.log("PASS: real DB rolls back failed issuance and rotation without partial sessions or consumed cookies");
      await run("rotate_cookie", "post", "/api/v1/auth/bootstrap");
      assert.notEqual(cookie, originalCookie, "Refresh must replace the original cookie");
      const original = await client.authToken.findUnique({ where: { tokenHash: sha256(decodeURIComponent(originalCookie.slice(originalCookie.indexOf("=") + 1))) } });
      assert(original?.consumedAt && original.sessionId, "Old token must be consumed in the committed transaction");
      await request(app).post("/api/v1/auth/refresh").set("Origin", "http://localhost:5173").set("Cookie", originalCookie).expect(401);
      const revoked = await client.session.findUnique({ where: { id: original.sessionId } });
      assert(revoked?.revokedAt, "Replaying the old token must revoke the session");
      const dedupeKey = `session-revoked:refresh-reuse:${original.sessionId}`;
      const event = await client.outboxEvent.findUnique({ where: { dedupeKey } });
      assert(event, "Revocation must atomically enqueue its durable event");
      const { enqueueOutbox } = await import("../src/outbox/outbox.js");
      await client.$transaction(async (tx) => {
        await enqueueOutbox(tx, "session.revoked", original.sessionId!, dedupeKey, { must_not_replace: true });
      });
      const duplicate = await client.outboxEvent.findUnique({ where: { dedupeKey } });
      assert.deepEqual(duplicate?.payload, event.payload, "Duplicate enqueue must keep the first payload");
      assert.equal(duplicate?.id, event.id, "Duplicate enqueue must keep the first event");
      await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${access}`).expect(401);
      access = "";
      console.log("PASS: real database rotation/replay revocation and outbox deduplication");
      await run("login_for_concurrent_refresh", "post", "/api/v1/auth/login", { email: "admin@remarket.vn", password: "remarket-demo-2026" });
      const competing = await Promise.all([1, 2].map(() => request(app).post("/api/v1/auth/refresh")
        .set("Origin", "http://localhost:5173").set("Cookie", cookie)));
      assert.deepEqual(competing.map((response) => response.status).sort(), [200, 401], "Only one concurrent refresh may succeed");
      const winner = competing.find((response) => response.status === 200)!;
      await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${winner.body.data.access_token}`).expect(401);
      access = "";
      console.log("PASS: concurrent old-cookie refresh rotates only once, then replay revokes the test session");
    } else {
    await run("guest_bootstrap", "post", "/api/v1/auth/bootstrap");
    await run("guest_categories", "get", "/api/v1/categories");
    await run("guest_products", "get", "/api/v1/products");
    await run("login_admin", "post", "/api/v1/auth/login", { email: "admin@remarket.vn", password: "remarket-demo-2026" });
    await run("post_login_identity", "get", "/api/v1/auth/me");
    await run("authenticated_reload_bootstrap", "post", "/api/v1/auth/bootstrap");
    await run("admin_dashboard", "get", "/api/v1/admin/dashboard?from=2026-09-08&to=2026-10-07");
    await run("admin_products", "get", "/api/v1/admin/products?status=PENDING&page=1");
    await run("admin_categories", "get", "/api/v1/admin/categories?page=1");
    await run("admin_reports", "get", "/api/v1/admin/reports?status=PENDING&page=1");
    await run("logout_button", "post", "/api/v1/auth/logout");
    access = "";
    }
  } finally {
    if (access) await request(app).post("/api/v1/auth/logout").set("Origin", "http://localhost:5173").set("Authorization", `Bearer ${access}`);
    await client.$disconnect();
  }
}
const dir = fileURLToPath(new URL("../../../.artifacts/performance/", import.meta.url));
await mkdir(dir, { recursive: true });
if (!/^[a-z-]+$/.test(label)) throw new Error("Invalid benchmark label");
await writeFile(`${dir}${label}.json`, JSON.stringify(results, null, 2));
