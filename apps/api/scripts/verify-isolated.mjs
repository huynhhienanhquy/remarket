// Never run integration tests or seed against the application's existing tables.
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import path from "node:path";
import { unlink } from "node:fs/promises";
import assert from "node:assert/strict";

const apiDir = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(path.join(apiDir, "package.json"));
require("dotenv").config({ path: path.join(apiDir, ".env"), quiet: true });
const { PrismaClient } = require("@prisma/client");
const schema = `remarket_verify_${randomUUID().replaceAll("-", "")}`;
assert.match(schema, /^remarket_verify_[a-f0-9]{32}$/);
const baseUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
assert.ok(baseUrl, "Configure a PostgreSQL URL before isolated verification");
const isolatedUrl = new URL(baseUrl);
isolatedUrl.searchParams.set("schema", schema);
isolatedUrl.searchParams.set("connection_limit", "5");
const admin = new PrismaClient({ datasources: { db: { url: baseUrl } } });
const isolated = new PrismaClient({ datasources: { db: { url: isolatedUrl.toString() } } });
const services = [];
let owned = false;
const childEnv = {
  ...process.env,
  NODE_ENV: "test", RUN_JOBS: "false", STORAGE_DRIVER: "local",
  DATABASE_URL: isolatedUrl.toString(), DIRECT_URL: isolatedUrl.toString(),
  BACKGROUND_DATABASE_URL: isolatedUrl.toString(),
  TEST_DATABASE_URL: isolatedUrl.toString(), DATABASE_USE_DIRECT_URL: "false",
  DATABASE_TRANSACTION_TIMEOUT_MS: "120000", DATABASE_TRANSACTION_MAX_WAIT_MS: "60000",
  JWT_SIGNING_KEY: randomUUID() + randomUUID(), JWT_SECRET: undefined,
  TEST_ACCOUNT_PASSWORD: randomUUID() + randomUUID(),
  SMOKE_WEB_URL: "http://127.0.0.1:5321",
  SMOKE_ADMIN_EMAIL: "admin@example.test",
  SMOKE_USER_EMAIL: "buyer@example.test",
  SMOKE_LIFECYCLE_ONLY: process.argv.includes("--lifecycle-only") ? "true" : "false",
  SMOKE_EMAIL_ONLY: process.argv.includes("--email-only") ? "true" : "false",
};
childEnv.SMOKE_ADMIN_PASSWORD = childEnv.TEST_ACCOUNT_PASSWORD;
childEnv.SMOKE_USER_PASSWORD = childEnv.TEST_ACCOUNT_PASSWORD;
async function run(moduleName, args, cwd = apiDir) {
  const child = spawn(process.execPath, [require.resolve(moduleName), ...args], {
    cwd, env: childEnv, stdio: "inherit", windowsHide: true,
  });
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject); child.once("exit", resolve);
  });
  assert.equal(code, 0, `${moduleName} failed (${code})`);
}
async function startService(cli, args, cwd, extraEnv = {}) {
  const child = spawn(process.execPath, [cli, ...args], { cwd, env: { ...childEnv, ...extraEnv }, stdio: "inherit", windowsHide: true });
  services.push(child);
  child.on("error", (error) => console.error(error.message));
}
async function waitForServer(url) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { if ((await fetch(url)).ok) return; } catch { /* still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server did not start: ${url}`);
}
try {
  const existing = await admin.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${schema}`;
  assert.equal(existing.length, 0, "Refusing to reuse an existing schema");
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  owned = true;
  const current = await isolated.$queryRaw`SELECT current_schema() AS name`;
  assert.equal(current[0].name, schema, "Database did not select the isolated schema");
  console.log(`Isolated test schema: ${schema}`);
  await run("prisma/build/index.js", ["migrate", "deploy", "--schema", "prisma/schema.prisma"]);
  if (!process.argv.includes("--browser-only")) await run("vitest/vitest.mjs", ["run", process.argv.includes("--auth-only") ? "tests/integration/auth-lifecycle.test.ts" : process.argv.includes("--search-only") ? "tests/integration/product-search.test.ts" : "tests/integration", "--testTimeout=120000", "--hookTimeout=120000"]);
  if (process.argv.includes("--benchmark") || process.argv.includes("--browser") || process.argv.includes("--browser-only") || process.argv.includes("--auth-browser")) {
    await run("tsx/cli", ["tests/fixtures/browser-seed.ts"]);
  }
  if (process.argv.includes("--benchmark")) {
    childEnv.BENCHMARK_ADMIN_EMAIL = "admin@example.test";
    childEnv.BENCHMARK_ADMIN_PASSWORD = childEnv.TEST_ACCOUNT_PASSWORD;
    await run("tsx/cli", ["scripts/benchmark-performance.ts", "supabase-code-final"]);
    await run("tsx/cli", ["scripts/benchmark-performance.ts", "security"]);
  }
  if (process.argv.includes("--browser") || process.argv.includes("--browser-only") || process.argv.includes("--auth-browser")) {
    for (const url of ["http://127.0.0.1:5320/health/live", "http://127.0.0.1:5321"]) {
      let alreadyRunning = false;
      try { alreadyRunning = (await fetch(url)).ok; } catch { /* port is free */ }
      assert.equal(alreadyRunning, false, `Refusing to reuse an existing server: ${url}`);
    }
    const webDir = path.resolve(apiDir, "../web");
    const webRequire = createRequire(path.join(webDir, "package.json"));
    await startService("--import", ["tsx", "src/index.ts"], apiDir, { PORT: "5320", RUN_JOBS: "true", WEB_ORIGINS: childEnv.SMOKE_WEB_URL, PUBLIC_WEB_URL: childEnv.SMOKE_WEB_URL });
    await startService(path.join(path.dirname(webRequire.resolve("vite/package.json")), "bin/vite.js"), ["--host", "127.0.0.1", "--port", "5321", "--strictPort"], webDir, { VITE_API_BASE_URL: "/api/v1", VITE_SOCKET_URL: "", VITE_DEV_API_TARGET: "http://127.0.0.1:5320" });
    await Promise.all([waitForServer("http://127.0.0.1:5320/health/live"), waitForServer(childEnv.SMOKE_WEB_URL)]);
    await run(process.argv.includes("--auth-browser") ? "../../scripts/smoke-session-recovery.mjs" : "../../scripts/smoke-member-flows.mjs", [], path.resolve(apiDir, "../.."));
  }
} finally {
  await Promise.all(services.map(async (child) => {
    if (child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill();
    await exited;
  }));
  if (owned) {
    const table = await isolated.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = ${schema} AND table_name = 'UploadAsset'`;
    if (table.length > 0) {
      const uploads = await isolated.uploadAsset.findMany({ select: { storagePath: true } });
      const uploadRoot = path.resolve(apiDir, "uploads");
      for (const upload of uploads) {
        for (const objectPath of [upload.storagePath, `${upload.storagePath}.card.webp`, `${upload.storagePath}.detail.webp`]) {
          const file = path.resolve(uploadRoot, objectPath.replace(/^users\//, ""));
          assert(file.startsWith(uploadRoot + path.sep), "Refusing an upload path outside the test storage root");
          await unlink(file).catch((error) => { if (error.code !== "ENOENT") throw error; });
        }
      }
      if (uploads.length) console.log(`Removed ${uploads.length} temporary upload files`);
    }
  }
  await isolated.$disconnect();
  if (owned) {
    assert.match(schema, /^remarket_verify_[a-f0-9]{32}$/);
    // Only this freshly created, unique namespace is removed, never public.
    await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    console.log(`Removed temporary test schema: ${schema}`);
  }
  await admin.$disconnect();
}
