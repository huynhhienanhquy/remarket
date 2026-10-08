// Real-browser auth smoke. Uses existing demo accounts, never changes roles or listings.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const web = "http://localhost:5173";
const timingLabel = process.argv[2] ?? "browser";
if (!/^[a-z-]+$/.test(timingLabel)) throw new Error("Invalid browser timing label");
const chrome = process.env.CHROME_BIN ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const profile = await mkdtemp(path.join(tmpdir(), "remarket-auth-smoke-"));
const artifactDir = path.resolve(".artifacts/session-recovery");
await mkdir(artifactDir, { recursive: true });
const browserProcess = spawn(chrome, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
const requests = [];
const exceptions = [];
const clients = [];
const timings = [];

async function measure(operation, action) {
  const start = performance.now();
  await action();
  const result = { operation, ms: Math.round(performance.now() - start) };
  timings.push(result);
  console.log(JSON.stringify(result));
}

function connect(url) {
  const socket = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message));
      else entry.resolve(message.result);
    } else if (message.method === "Network.responseReceived" && message.params.response.url.startsWith("http://localhost:3000/api/v1")) {
      const response = message.params.response;
      requests.push({ path: new URL(response.url).pathname, status: response.status });
    } else if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.text);
  });
  return {
    close: () => socket.close(),
    async send(method, params = {}) {
      await ready;
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 60_000);
        pending.set(requestId, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    },
  };
}
async function evaluate(tab, expression) {
  const result = await tab.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(tab, expression, label) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await evaluate(tab, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await screenshot(tab, "failure");
  console.error(JSON.stringify({ stage: label, recent_requests: requests.slice(-12), visible_text: (await evaluate(tab, "document.body.innerText")).slice(0, 900) }));
  throw new Error(`UI timeout: ${label}; path=${await evaluate(tab, "location.pathname")}`);
}
async function screenshot(tab, name) {
  const result = await tab.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(artifactDir, `${name}.png`), Buffer.from(result.data, "base64"));
}
async function login(tab, email) {
  await tab.send("Page.navigate", { url: `${web}/login` });
  await waitFor(tab, "Boolean(document.querySelector('#login-email'))", "login form");
  await evaluate(tab, `(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [id, value] of [['login-email', ${JSON.stringify(email)}], ['login-password', 'remarket-demo-2026']]) {
      const input = document.getElementById(id); setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  })()`);
  await evaluate(tab, "document.querySelector('form').requestSubmit()");
}
let browser;
let tabB;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let stderr = "";
    const timer = setTimeout(() => reject(new Error("Chrome startup timeout")), 20_000);
    browserProcess.once("error", (error) => { clearTimeout(timer); reject(error); });
    browserProcess.once("exit", () => { clearTimeout(timer); reject(new Error("Chrome exited during startup")); });
    browserProcess.stderr.on("data", (chunk) => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  browser = connect(endpoint);
  clients.push(browser);
  const port = new URL(endpoint).port;
  async function newTab() {
    const created = await browser.send("Target.createTarget", { url: "about:blank" });
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = tabs.find((tab) => tab.id === created.targetId);
    assert(target, "Created target must be discoverable");
    const tab = connect(target.webSocketDebuggerUrl);
    clients.push(tab);
    await tab.send("Page.enable"); await tab.send("Runtime.enable"); await tab.send("Network.enable");
    await tab.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false });
    return tab;
  }
  const tabA = await newTab();
  await measure("browser_login_to_dashboard", async () => {
    await login(tabA, "admin@remarket.vn");
    await waitFor(tabA, "location.pathname === '/admin' && document.body.innerText.includes('Tổng user')", "admin dashboard data");
  });
  assert(!await evaluate(tabA, "document.body.innerText.includes('Chưa tải được dữ liệu')"));
  await screenshot(tabA, "admin-dashboard");
  await measure("browser_reload_dashboard", async () => {
    await tabA.send("Page.reload", { ignoreCache: false });
    await waitFor(tabA, "location.pathname === '/admin' && document.body.innerText.includes('Tổng user')", "dashboard after reload");
  });
  for (const route of ["/admin/users", "/admin/products", "/admin/categories", "/admin/reports", "/admin/reviews", "/admin/support", "/admin/audit"]) {
    await measure(`browser_navigation_${route.split('/').at(-1)}`, async () => {
      const start = requests.length;
      await evaluate(tabA, `document.querySelector('a[href=${JSON.stringify(route)}]').click()`);
      const apiPath = route === "/admin/support" ? "/api/v1/admin/support-tickets"
        : route === "/admin/audit" ? "/api/v1/admin/audit-logs" : `/api/v1${route}`;
      const deadline = Date.now() + 90_000;
      while (!requests.slice(start).some((request) => request.path === apiPath && request.status === 200)) {
        if (Date.now() > deadline) throw new Error(`Admin list did not load: ${route}`);
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      await waitFor(tabA, `location.pathname === ${JSON.stringify(route)} && !document.querySelector('main [aria-busy="true"]')`, `render ${route}`);
    });
    assert(!await evaluate(tabA, "document.body.innerText.includes('Chưa tải được dữ liệu')"));
  }
  for (const apiPath of ["dashboard", "users", "products", "categories", "categories/tree", "reports", "reviews", "support-tickets", "audit-logs"]) {
    assert(requests.some((request) => request.path === `/api/v1/admin/${apiPath}` && request.status === 200), `Admin ${apiPath} returns 200`);
  }
  console.log("PASS: all eight admin screens load with 200");

  // Another tab logs out the shared browser session, then logs in as USER.
  tabB = await newTab();
  await tabB.send("Page.navigate", { url: `${web}/admin` });
  await waitFor(tabB, "Boolean([...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Đăng xuất'))", "second admin tab");
  await measure("browser_logout_button", async () => {
    await evaluate(tabB, "[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Đăng xuất').click()");
    await waitFor(tabB, "Boolean([...document.querySelectorAll('button')].find(b => b.textContent.includes('Đang đăng xuất') && b.disabled))", "immediate logout feedback");
    await waitFor(tabB, "location.pathname === '/' || location.pathname === '/login'", "logout");
  });
  console.log("PASS: second tab logout completed");
  await measure("browser_member_login_to_home", async () => {
    await login(tabB, "anh.mua@remarket.vn");
    await waitFor(tabB, "location.pathname === '/' && document.body.innerText.includes('Món đồ cũ. Giá trị mới.')", "member login");
  });
  const start = requests.length;
  // Trigger an uncached filter even when fast navigation kept list data fresh.
  await evaluate(tabA, "document.querySelector('a[href=\"/admin/users\"]').click()");
  await waitFor(tabA, "location.pathname === '/403' || Boolean(document.querySelector('#user-role'))", "old tab user filter");
  if (await evaluate(tabA, "location.pathname !== '/403'")) {
    await evaluate(tabA, "(() => { const role = document.getElementById('user-role'); role.value = 'ADMIN'; role.dispatchEvent(new Event('change', { bubbles: true })); })()");
  }
  await waitFor(tabA, "location.pathname === '/403'", "stale admin tab leaves admin");
  assert(!await evaluate(tabA, "Boolean(document.querySelector('nav[aria-label=\"Khu vực quản trị\"]'))"));
  const recovered = requests.slice(start);
  assert(recovered.some((request) => request.path.startsWith("/api/v1/admin/") && request.status === 401), "Expired old session is detected");
  assert(recovered.some((request) => request.path === "/api/v1/auth/bootstrap" && request.status === 200), "Cookie restores the USER session");
  assert(!recovered.some((request) => request.path.startsWith("/api/v1/admin/") && request.status === 403), "No admin request is replayed under USER");
  await screenshot(tabA, "stale-admin-recovered");
  assert.equal(exceptions.length, 0, "No uncaught browser exceptions");
  console.log("PASS: second-tab USER login removes stale admin UI; no forbidden admin replay");
  console.log(`Screenshots: ${artifactDir}`);
  await mkdir(path.resolve(".artifacts/performance"), { recursive: true });
  await writeFile(path.resolve(`.artifacts/performance/${timingLabel}.json`), JSON.stringify(timings, null, 2));
} finally {
  // Logout only this isolated browser's test session; never logout-all.
  if (tabB) {
    try { await evaluate(tabB, "(async () => { const { api, http } = await import('/src/lib/api/index.ts'); if (http.getAccessToken()) await api.auth.logout(); })()"); }
    catch { console.error("Test-session logout unavailable; its normal expiry remains in effect."); }
  }
  if (browser) await browser.send("Browser.close").catch(() => undefined);
  for (const client of clients) client.close();
  if (browserProcess.exitCode === null) await new Promise((resolve) => { browserProcess.once("exit", resolve); setTimeout(resolve, 5_000); });
  // The target is the exact mkdtemp profile created above, never a user profile.
  if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith("remarket-auth-smoke-")) {
    await rm(profile, { recursive: true, force: true }).catch(() => undefined);
  }
}
