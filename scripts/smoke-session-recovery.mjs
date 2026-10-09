// Real-browser auth smoke using operator-selected test accounts.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const web = process.env.SMOKE_WEB_URL ?? "http://localhost:5173";
const adminEmail = process.env.SMOKE_ADMIN_EMAIL;
const adminPassword = process.env.SMOKE_ADMIN_PASSWORD;
const userEmail = process.env.SMOKE_USER_EMAIL;
const userPassword = process.env.SMOKE_USER_PASSWORD;
const secondUserEmail = process.env.SMOKE_SECOND_USER_EMAIL;
const secondUserPassword = process.env.SMOKE_SECOND_USER_PASSWORD;
assert.ok(adminEmail && adminPassword && userEmail && userPassword, "Set SMOKE_ADMIN_EMAIL/PASSWORD and SMOKE_USER_EMAIL/PASSWORD for dedicated test accounts");
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
const sessionTabs = [];

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
    } else if (message.method === "Network.responseReceived" && message.params.response.url.includes("/api/v1/")) {
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
  console.error(JSON.stringify({ stage: label, recent_requests: requests.slice(-12), visible_text: (await evaluate(tab, "document.body.innerText")).slice(0, 900) }));
  await screenshot(tab, "failure").catch((error) => console.error(`Failure screenshot unavailable: ${error.message}`));
  throw new Error(`UI timeout: ${label}; path=${await evaluate(tab, "location.pathname")}`);
}
async function screenshot(tab, name) {
  // Inactive headless targets may have no surface to capture until activated.
  await tab.send("Page.bringToFront");
  const result = await tab.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(artifactDir, `${name}.png`), Buffer.from(result.data, "base64"));
}
async function login(tab, email, password) {
  await tab.send("Page.navigate", { url: `${web}/login` });
  await waitFor(tab, "Boolean(document.querySelector('#login-email'))", "login form");
  await evaluate(tab, `(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [id, value] of [['login-email', ${JSON.stringify(email)}], ['login-password', ${JSON.stringify(password)}]]) {
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
    sessionTabs.push(tab);
    await tab.send("Page.enable"); await tab.send("Runtime.enable"); await tab.send("Network.enable");
    await tab.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false });
    return tab;
  }
  const tabA = await newTab();
  await measure("browser_login_to_dashboard", async () => {
    await login(tabA, adminEmail, adminPassword);
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

  // All targets use the same Chrome profile and cookie jar, with separate scopes.
  tabB = await newTab();
  await tabB.send("Page.navigate", { url: `${web}/admin` });
  await waitFor(tabB, "location.pathname === '/login' && Boolean(document.querySelector('#login-email'))", "new tab has no inherited admin session");
  await measure("browser_member_login_to_home", async () => {
    await login(tabB, userEmail, userPassword);
    await waitFor(tabB, "location.pathname === '/' && document.body.innerText.includes('Món đồ cũ. Giá trị mới.')", "member login");
  });
  const tabs = [tabA, tabB];
  const expectedEmails = [adminEmail, userEmail];
  const expectedRoles = ["ADMIN", "USER"];
  if (secondUserEmail && secondUserPassword) {
    const tabC = await newTab();
    await login(tabC, secondUserEmail, secondUserPassword);
    await waitFor(tabC, "location.pathname === '/' && document.body.innerText.includes('Món đồ cũ. Giá trị mới.')", "second member login");
    console.log("PASS: second member logged in to a third tab");
    tabs.push(tabC); expectedEmails.push(secondUserEmail); expectedRoles.push("USER");
  }
  const identity = "(async () => { const { getSessionUser } = await import('/src/stores/sessionStore.ts'); return getSessionUser()?.email; })()";
  await tabA.send("Page.bringToFront");
  assert.deepEqual(await Promise.all(tabs.map((tab) => evaluate(tab, identity))), expectedEmails);
  assert(await evaluate(tabA, "Boolean(document.querySelector('nav[aria-label=\"Khu vực quản trị\"]'))"));
  const scopes = await Promise.all(tabs.map((tab) => evaluate(tab, "sessionStorage.getItem('remarket:session-scope')")));
  assert.equal(new Set(scopes).size, tabs.length, "Every account has a separate cookie scope");
  for (let index = 0; index < tabs.length; index++) {
    const tab = tabs[index];
    await tab.send("Page.reload", { ignoreCache: false });
    await waitFor(tab, `(async () => { const { getSessionUser } = await import('/src/stores/sessionStore.ts'); return getSessionUser()?.email === ${JSON.stringify(expectedEmails[index])}; })()`, "reload restores the same account");
    assert.equal(await evaluate(tab, "sessionStorage.getItem('remarket:session-scope')"), scopes[index]);
    console.log(`PASS: tab ${index + 1} retained its account and scope after reload`);
  }
  console.log(`PASS: ${tabs.length} accounts stay independent in one browser, including focus and reload`);
  await screenshot(tabA, "independent-admin");
  await screenshot(tabB, "independent-member");
  // Expired access in every tab rotates only that tab's refresh cookie.
  const recoveryStart = requests.length;
  await Promise.all(tabs.map((tab) => evaluate(tab, "(async () => { const { http } = await import('/src/services/api.ts'); http.setAccessToken('expired-diagnostic-token'); })()")));
  const recovery = await Promise.all(tabs.map((tab) => evaluate(tab, `(async () => {
    const { api } = await import('/src/services/api.ts');
    const { getSessionUser, getSessionRevision } = await import('/src/stores/sessionStore.ts');
    const before = { user: getSessionUser(), revision: getSessionRevision(), scope: sessionStorage.getItem('remarket:session-scope') };
    try { return { role: (await api.auth.me())?.role, before, after: { user: getSessionUser(), revision: getSessionRevision() } }; }
    catch (error) { return { error: error.code, before, after: { user: getSessionUser(), revision: getSessionRevision() } }; }
  })()`)));
  if (recovery.some((result) => result.error)) console.error(JSON.stringify({ recovery, recent_requests: requests.slice(recoveryStart) }));
  const restored = recovery.map((result) => result.role);
  assert.deepEqual(restored, expectedRoles);
  const rotations = requests.slice(recoveryStart).filter((request) => request.path === "/api/v1/auth/refresh");
  assert.equal(rotations.length, tabs.length, "Each tab performs one refresh");
  assert(rotations.every((request) => request.status === 200), "No concurrent cookie replay revokes the session");
  console.log("PASS: simultaneous cross-tab access recovery rotates cookies without replay or logout");
  await evaluate(tabB, "(async () => { const { api } = await import('/src/services/api.ts'); await api.auth.logout(); })()");
  assert.equal(await evaluate(tabB, identity), undefined);
  assert.equal(await evaluate(tabA, identity), adminEmail);
  if (tabs[2]) assert.equal(await evaluate(tabs[2], identity), secondUserEmail);
  const dashboard = await evaluate(tabA, "(async () => { const { http } = await import('/src/services/api.ts'); return await http.get('/admin/dashboard'); })()");
  assert(dashboard, "Admin API still works after another tab logs out");
  console.log("PASS: member logout leaves admin and other member sessions active");
  assert.equal(exceptions.length, 0, "No uncaught browser exceptions");
  console.log(`Screenshots: ${artifactDir}`);
  await mkdir(path.resolve(".artifacts/performance"), { recursive: true });
  await writeFile(path.resolve(`.artifacts/performance/${timingLabel}.json`), JSON.stringify(timings, null, 2));
} finally {
  // Logout each isolated browser test session; never logout-all.
  for (const tab of sessionTabs) {
    try { await evaluate(tab, "(async () => { const { api, http } = await import('/src/services/api.ts'); if (http.getAccessToken()) await api.auth.logout(); })()"); }
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
