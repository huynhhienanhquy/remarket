// Guest browser benchmark against local Vite and the configured API. It owns
// its ports/profile and does not log in or create fixtures. Image GETs retain
// the application's normal legacy-file backfill behavior.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const label = process.argv[2] ?? "first-load";
assert.match(label, /^[a-z-]+$/);
const apiDir = path.join(root, "apps/api"), webDir = path.join(root, "apps/web");
const apiRequire = createRequire(path.join(apiDir, "package.json"));
const webRequire = createRequire(path.join(webDir, "package.json"));
const web = "http://127.0.0.1:5391", api = "http://127.0.0.1:5390";
const children = [], connections = [];
const exceptions = [], serverFailures = [];
const profile = await mkdtemp(path.join(tmpdir(), "remarket-first-load-"));
const report = { api_startup_ms: 0, pages: [] };
function start(args, cwd, env = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  child.on("exit", (code) => { if (code && !child.killed) console.error(`Benchmark child exited: ${path.basename(args.at(-1))} (${code})`); });
  child.stdout.resume();
  child.stderr.on("data", (chunk) => { child.startupError = (child.startupError ?? "") + chunk.toString(); });
  return child;
}
async function until(check, label, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timeout: ${label}`);
}
function connect(url) {
  const socket = new WebSocket(url), pending = new Map(); let sequence = 0;
  const ready = new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
    if (message.method === "Network.responseReceived" && message.params.response.status >= 500) {
      serverFailures.push({ path: new URL(message.params.response.url).pathname, status: message.params.response.status });
    }
    const item = pending.get(message.id);
    if (!item) return;
    clearTimeout(item.timer); pending.delete(message.id);
    message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result);
  });
  connections.push(socket);
  return { async send(method, params = {}) {
    await ready;
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 30_000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  } };
}
async function evaluate(tab, expression) {
  const result = await tab.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
try {
  for (const url of [web, `${api}/health/live`]) {
    let occupied = false;
    try { occupied = (await fetch(url)).ok; } catch { /* free port */ }
    assert.equal(occupied, false, `Refusing to reuse existing server: ${url}`);
  }
  const startup = performance.now();
  start(["--import", pathToFileURL(apiRequire.resolve("tsx")).href, "src/index.ts"], apiDir, {
    PORT: "5390", RUN_JOBS: "false", WEB_ORIGINS: web, PUBLIC_WEB_URL: web,
    ...(process.argv.includes("--pg-adapter") ? { DATABASE_DRIVER_ADAPTER: "pg", DATABASE_USE_DIRECT_URL: "false" } : {}),
  });
  start([path.join(path.dirname(webRequire.resolve("vite/package.json")), "bin/vite.js"), "--host", "127.0.0.1", "--port", "5391", "--strictPort"], webDir, {
    VITE_API_BASE_URL: "/api/v1", VITE_SOCKET_URL: "", VITE_DEV_API_TARGET: api,
  });
  await until(async () => {
    const failed = children.find((child) => child.exitCode !== null);
    if (failed) throw new Error(`Benchmark server failed: ${failed.startupError?.slice(0, 2000)}`);
    try { return (await fetch(`${api}/health/live`)).ok && (await fetch(web)).ok; } catch { return false; }
  }, "local servers ready");
  report.api_startup_ms = Math.round(performance.now() - startup);
  const chrome = spawn(process.env.CHROME_BIN ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", [
    "--headless=new", "--disable-dev-shm-usage", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank",
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  children.push(chrome);
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chrome startup timeout")), 20_000);
    chrome.once("error", (error) => { clearTimeout(timer); reject(error); });
    chrome.stderr.on("data", (chunk) => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/\S+)/); if (match) { clearTimeout(timer); resolve(match[1]); } });
  });
  const browser = connect(endpoint);
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const targets = await (await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`)).json();
  const tab = connect(targets.find((target) => target.id === targetId).webSocketDebuggerUrl);
  await tab.send("Page.enable"); await tab.send("Network.enable");
  await tab.send("Runtime.enable");
  await tab.send("Network.setCacheDisabled", { cacheDisabled: true });
  await tab.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false });
  if (process.argv.includes("--fixture")) {
    assert.match(new URL(process.env.TEST_DATABASE_URL).searchParams.get("schema") ?? "", /^remarket_verify_[a-f0-9]{32}$/);
    assert.ok(process.env.TEST_ACCOUNT_PASSWORD);
    await tab.send("Page.navigate", { url: web + "/login" });
    await until(() => evaluate(tab, "document.body.innerText.includes('Đăng nhập')"), "login ready");
    await evaluate(tab, `(async () => { const {api} = await import('/src/services/api.ts'); await api.auth.login('buyer@example.test', ${JSON.stringify(process.env.TEST_ACCOUNT_PASSWORD)}); return true; })()`);
  }
  for (const route of ["/", "/products"]) {
    const started = performance.now();
    await tab.send("Page.navigate", { url: web + route });
    await until(() => evaluate(tab, `location.pathname === ${JSON.stringify(route)} && !!document.querySelector('main') && !document.querySelector('main .rm-skeleton')`), "page data ready");
    const dataReady = Math.round(performance.now() - started);
    await until(() => evaluate(tab, `Array.from(document.querySelectorAll('main img')).filter(img => img.getBoundingClientRect().top < innerHeight).every(img => img.complete)`), "visible images complete");
    const metrics = await evaluate(tab, `({
      errors: document.body.innerText.includes('Không tải được') || document.body.innerText.includes('Chưa thể kiểm tra phiên'),
      broken_images: Array.from(document.querySelectorAll('main img')).filter(img => img.getBoundingClientRect().top < innerHeight && !img.naturalWidth).length,
      cards_with_images: document.querySelectorAll('main article img').length,
      cards_with_placeholders: Array.from(document.querySelectorAll('main article')).filter(card => !card.querySelector('img')).length,
      paint: performance.getEntriesByType('paint').map(e => ({name:e.name, ms:Math.round(e.startTime)})),
      resources: performance.getEntriesByType('resource').filter(e => ['fetch', 'script', 'img'].includes(e.initiatorType))
        .map(e => ({path:new URL(e.name).pathname, kind:e.initiatorType, status:e.responseStatus, start_ms:Math.round(e.startTime), duration_ms:Math.round(e.duration), bytes:e.transferSize}))
    })`);
    assert.equal(metrics.errors, false, "First-load API/UI error");
    assert.equal(metrics.broken_images, 0, "Broken visible image");
    assert.equal(exceptions.length, 0, "Uncaught browser exception");
    assert.equal(serverFailures.length, 0, "Server response failure");
    if (process.argv.includes("--fixture")) {
      assert.equal(metrics.cards_with_images, 4, "All real fixture images must render");
      assert.equal(metrics.cards_with_placeholders, 0, "Real images must not be replaced with placeholders");
      assert.ok(metrics.resources.filter((resource) => resource.kind === "img").every((resource) => resource.status === 200), "All image GETs succeed");
      assert.equal(metrics.resources.filter((resource) => resource.path === "/api/v1/auth/bootstrap").length, 1);
      assert.equal(metrics.resources.filter((resource) => resource.path === "/api/v1/products").length, 1);
      assert.ok(await evaluate(tab, "import('/src/services/http.ts').then(m => Boolean(m.getAccessToken()))"), "Member session restored after reload");
    }
    const row = { route, data_ready_ms: dataReady, visible_images_ms: Math.round(performance.now() - started), ...metrics };
    report.pages.push(row);
    console.log(JSON.stringify({ route, data_ready_ms: row.data_ready_ms, visible_images_ms: row.visible_images_ms,
      first_api_ms: row.resources.find((resource) => resource.path.includes('/api/v1'))?.start_ms,
      api_requests: row.resources.filter((resource) => resource.path.includes('/api/v1') && resource.kind === 'fetch'),
      image_responses: row.resources.filter((resource) => resource.kind === 'img').map(({status,bytes}) => ({status,bytes})),
      cards_with_images: row.cards_with_images, cards_with_placeholders: row.cards_with_placeholders,
      script_requests: row.resources.filter((resource) => resource.path.endsWith('.tsx') || resource.path.endsWith('.ts')).length }));
  }
  const destination = path.join(root, ".artifacts/performance");
  await mkdir(destination, { recursive: true });
  await writeFile(path.join(destination, `${label}-browser.json`), JSON.stringify(report, null, 2));
} finally {
  for (const socket of connections) socket.close();
  await Promise.all(children.reverse().map(async (child) => {
    if (child.exitCode !== null) return;
    const exited = new Promise((resolve) => child.once("exit", resolve));
    child.kill(); await exited;
  }));
  assert(path.resolve(profile).startsWith(path.join(path.resolve(tmpdir()), "remarket-first-load-")));
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
