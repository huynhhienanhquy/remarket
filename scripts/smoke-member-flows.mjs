// Real browser and live adapter verification. Run ONLY through verify-isolated.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

assert.match(new URL(process.env.TEST_DATABASE_URL ?? "http://invalid").searchParams.get("schema") ?? "", /^remarket_verify_[a-f0-9]{32}$/);
const web = process.env.SMOKE_WEB_URL ?? "http://127.0.0.1:5321";
const profile = await mkdtemp(path.join(tmpdir(), "remarket-member-smoke-"));
const artifacts = path.resolve(".artifacts/member-smoke");
await mkdir(artifacts, { recursive: true });
const chrome = spawn(process.env.CHROME_BIN ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
const clients = [], exceptions = [], failures = [], checks = [], requests = [];
let browser;
function connect(url) {
  const ws = new WebSocket(url); let seq = 0; const pending = new Map(); const frames = [];
  const ready = new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  ws.addEventListener("message", (event) => {
    const m = JSON.parse(event.data);
    if (m.id) { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    else if (m.method === "Network.webSocketFrameReceived") frames.push(m.params.response.payloadData);
    else if (m.method === "Runtime.exceptionThrown") exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    else if (m.method === "Network.responseReceived") {
      if (m.params.response.url.includes('/api/v1')) requests.push({ path: new URL(m.params.response.url).pathname, status: m.params.response.status });
      if (m.params.response.status >= 500) failures.push({ url: m.params.response.url, status: m.params.response.status });
    }
  });
  const client = { frames, close: () => ws.close(), async send(method, params = {}) {
    await ready; const id = ++seq;
    return new Promise((resolve, reject) => { const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout ${method}`)); }, 120000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
  } }; clients.push(client); return client;
}
async function evaluate(tab, expression) {
  const r = await tab.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function screenshot(tab, label) {
  const r = await tab.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(artifacts, `${label}.png`), Buffer.from(r.data, "base64"));
}
async function wait(tab, expression, label) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) { if (await evaluate(tab, expression)) return; await new Promise((resolve) => setTimeout(resolve, 200)); }
  await screenshot(tab, "failure");
  console.error(JSON.stringify({ stage: label, requests: requests.slice(-20), cookies: (await tab.send('Network.getAllCookies')).cookies.map(({name,domain,path,secure,expires}) => ({name,domain,path,secure,expires})) }));
  throw new Error(`Timeout ${label}: ${(await evaluate(tab, "document.body.innerText")).slice(0, 1500)}`);
}
async function fill(tab, selector, value) {
  await evaluate(tab, `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw Error('Missing field'); const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input', {bubbles:true})); })()`);
}
async function click(tab, text) {
  await evaluate(tab, `(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === ${JSON.stringify(text)} && !e.disabled); if (!b) throw Error('Missing enabled button: '+${JSON.stringify(text)}); b.click(); })()`);
}
async function visit(tab, route, visible, label, mobile = false) {
  await tab.send("Emulation.setDeviceMetricsOverride", { width: mobile ? 360 : 1440, height: mobile ? 800 : 1024, deviceScaleFactor: 1, mobile });
  await tab.send("Page.navigate", { url: web + route });
  await wait(tab, `location.pathname === ${JSON.stringify(route.split("?")[0])} && document.body.innerText.includes(${JSON.stringify(visible)})`, label);
  // Wait for route query loading to settle, not merely for the shell to mount.
  await wait(tab, "!document.querySelector('main [aria-busy=\"true\"], main .rm-skeleton') && !document.body.innerText.includes('Đang khôi phục phiên')", label + " loaded");
  // Public routes render before session recovery; protected adapter calls must
  // wait for the logged-in identity instead of racing bootstrap in the harness.
  await wait(tab, "import('/src/lib/api/http.ts').then(m => Boolean(m.getAccessToken()))", label + " session ready");
  await wait(tab, "[...document.querySelectorAll('img')].filter(img => new URL(img.src).pathname.startsWith('/api/v1/uploads/')).every(img => img.complete && img.naturalWidth > 0)", label + " uploaded images decoded");
  const dimensions = await evaluate(tab, "({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth })");
  assert(dimensions.scroll <= dimensions.width + 1, `Horizontal overflow ${label}: ${JSON.stringify(dimensions)}`);
  assert(!await evaluate(tab, "document.body.innerText.includes('Chưa tải được dữ liệu') || document.body.innerText.includes('Không tải được dữ liệu')"), `Query error ${label}`);
  await screenshot(tab, label); checks.push(label); console.log(`PASS UI: ${label}`);
}
const call = (tab, code) => evaluate(tab, `(async () => { const {api} = await import('/src/lib/api/index.ts'); ${code} })()`);
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = ""; const timer = setTimeout(() => reject(new Error("Chrome startup timeout")), 20000);
    chrome.once("error", (e) => { clearTimeout(timer); reject(e); });
    chrome.stderr.on("data", (chunk) => { output += chunk; const m = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
  });
  browser = connect(endpoint); const port = new URL(endpoint).port;
  async function tabFor(email) {
    const context = await browser.send("Target.createBrowserContext");
    const target = await browser.send("Target.createTarget", { url: "about:blank", browserContextId: context.browserContextId });
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const tab = connect(tabs.find((t) => t.id === target.targetId).webSocketDebuggerUrl);
    await tab.send("Page.enable"); await tab.send("Runtime.enable"); await tab.send("Network.enable");
    await tab.send("Page.navigate", { url: web + "/login" });
    await wait(tab, "Boolean(document.querySelector('#login-email'))", "login form");
    await fill(tab, "#login-email", email); await fill(tab, "#login-password", "remarket-demo-2026");
    await evaluate(tab, "document.querySelector('form').requestSubmit()");
    await wait(tab, "location.pathname === '/' || location.pathname === '/admin' || location.pathname === '/orders'", "login redirect");
    const cookies = (await tab.send('Network.getAllCookies')).cookies;
    console.log(JSON.stringify({ login: email, cookies: cookies.map(({name,domain,path,secure,expires}) => ({name,domain,path,secure,expires})) }));
    assert(cookies.some(cookie => cookie.name === 'remarket_refresh'), 'Login must set the refresh cookie');
    return tab;
  }
  if (process.env.SMOKE_EMAIL_ONLY === "true") {
    const user = await tabFor("vy.moi@remarket.vn");
    const admin = await tabFor("admin@remarket.vn");
    await visit(user, "/verify-email?returnTo=%2Fcheckout", "Gửi yêu cầu xác minh email", "email-request-mobile", true);
    const before = await call(user, "return api.auth.me();");
    assert.equal(before.email_verified_at, null);
    assert.equal(await evaluate(user, "document.getElementById('verification-email').readOnly"), true);
    await click(user, "Gửi yêu cầu xác minh email");
    await wait(user, "location.pathname === '/' && document.body.innerText.includes('Món đồ cũ')", "email request returns home");
    assert.equal((await call(user, "return api.auth.me();")).email_verified_at, null);
    checks.push("email-request-home-not-self-verified");
    await wait(admin, "Boolean(document.querySelector('[aria-label=\"1 yêu cầu chờ duyệt\"]'))", "admin pending badge");
    const notices = await call(admin, "return api.notifications.list({page:1});");
    assert(notices.items.some(item => item.type === "EMAIL_VERIFICATION_REQUESTED" && item.reference_id === before.id));
    checks.push("admin-durable-notification");
    await visit(admin, "/admin/email-verifications", before.email, "email-admin-queue-desktop");
    await visit(admin, "/admin/email-verifications", before.email, "email-admin-queue-mobile", true);
    await click(admin, "Đồng ý xác minh");
    await wait(admin, "Boolean(document.querySelector('[role=dialog]'))", "email confirmation dialog");
    await screenshot(admin, "email-approve-dialog-mobile");
    const revisionBefore = await evaluate(user, "import('/src/lib/api/session.ts').then(m => m.getSessionRevision())");
    await evaluate(admin, "[...document.querySelectorAll('[role=dialog] button')].find(b => b.textContent.trim() === 'Đồng ý xác minh').click()");
    await wait(admin, "!document.querySelector('[role=dialog]') && document.body.innerText.includes('Không có yêu cầu xác minh email')", "email approved queue empty");
    await wait(user, `import('/src/lib/api/session.ts').then(m => m.getSessionRevision() > ${revisionBefore})`, "verified session refreshed without reload");
    const approved = await call(user, "return api.auth.me();");
    assert(approved.email_verified_at);
    assert.equal(await evaluate(user, "location.pathname"), "/");
    await wait(user, "Boolean(document.body.innerText.includes('Món đồ cũ'))", "home still visible");
    // The actual socket frame proves realtime delivery, not merely a REST refresh.
    assert(user.frames.some(frame => frame.includes("email.verified")), "Email approval must arrive over WebSocket");
    checks.push("email-approval-live-websocket-session");
    await visit(user, "/account/products/new", "Đăng tin mới", "email-verified-selling-unlocked", true);
    await visit(user, "/notifications", "Email đã được xác minh", "email-approved-notification-mobile", true);
    await visit(admin, "/admin/email-verifications?status=APPROVED", before.email, "email-approved-history-desktop");
    await call(admin, `return api.admin.approveEmailVerification(${JSON.stringify(before.id)});`);
    const noticesAfter = await call(user, "return api.notifications.list({page:1});");
    assert.equal(noticesAfter.items.filter(item => item.type === "EMAIL_VERIFIED").length, 1);
    checks.push("email-approval-idempotent");
  } else {
  const buyer = await tabFor("ha.mua@remarket.vn");
  const seller = await tabFor("lan.ban@remarket.vn");
  const admin = await tabFor("admin@remarket.vn");
  if (process.env.SMOKE_LIFECYCLE_ONLY !== "true") {
  for (const [route, text, label] of [["/", "Món đồ cũ", "home"], ["/products", "sản phẩm", "search"], ["/account", "Lưu thay đổi", "profile"], ["/favorites", "Sản phẩm yêu thích", "favorites"], ["/cart", "Giỏ hàng", "cart"], ["/orders", "Đơn mua", "orders"], ["/notifications", "Thông báo", "notifications"], ["/support", "hỗ trợ", "support"], ["/messages", "Tin nhắn", "inbox"]]) {
    await visit(buyer, route, text, `${label}-desktop`);
    await visit(buyer, route, text, `${label}-mobile`, true);
  }
  await visit(buyer, "/account", "Lưu thay đổi", "profile-save", true);
  await fill(buyer, "#profile-name", "Người mua kiểm thử live"); await click(buyer, "Lưu thay đổi");
  await wait(buyer, "document.body.innerText.includes('Đã lưu hồ sơ')", "profile persisted");
  await visit(buyer, "/support/new", "Gửi yêu cầu", "support-new", true);
  await fill(buyer, "#support-subject", "Kiểm thử hỗ trợ trực tiếp"); await fill(buyer, "#support-message", "Nội dung yêu cầu hỗ trợ qua giao diện thật."); await click(buyer, "Gửi yêu cầu");
  await wait(buyer, "Boolean(document.querySelector('#ticket-reply'))", "new ticket thread");
  const ticketPath = await evaluate(buyer, "location.pathname");
  await fill(buyer, "#ticket-reply", "Phản hồi bổ sung từ trình duyệt"); await click(buyer, "Gửi phản hồi");
  await wait(buyer, "document.body.innerText.includes('Phản hồi bổ sung từ trình duyệt')", "ticket reply");
  await screenshot(buyer, "support-thread-mobile");
  await visit(buyer, ticketPath, "Phản hồi bổ sung", "support-thread-desktop");
  const conversation = "/messages/40000000-0000-0000-0000-000000000001";
  await visit(buyer, conversation, "Gửi tin nhắn", "chat-mobile", true);
  await visit(seller, conversation, "Gửi tin nhắn", "chat-desktop");
  const content = `Kiểm thử realtime ${Date.now()}`;
  await wait(buyer, "!document.body.innerText.includes('Đang kết nối lại')", "buyer socket connected");
  await wait(seller, "!document.body.innerText.includes('Đang kết nối lại')", "seller socket connected");
  await fill(buyer, "#chat-message", content); await click(buyer, "Gửi tin nhắn");
  await wait(buyer, `document.body.innerText.includes(${JSON.stringify(content)}) && !document.body.innerText.includes('Đang gửi…')`, "chat persisted");
  await wait(seller, `document.body.innerText.includes(${JSON.stringify(content)})`, "chat received");
  assert(seller.frames.some(frame => frame.includes('message:created') && frame.includes(content)), 'Message must arrive over an actual WebSocket event');
  await wait(buyer, "document.body.innerText.includes('Đã xem')", "read receipt");
  await screenshot(seller, "chat-live-received"); console.log("PASS: two-session live chat and read receipt");
  }
  await visit(seller, "/account/products/new", "Đăng tin mới", "product-form-mobile", true);
  await visit(seller, "/account/products", "Tin đăng của tôi", "my-products-mobile", true);
  const requireApi = createRequire(path.resolve("apps/api/package.json"));
  const png = await requireApi("sharp")({ create: { width: 64, height: 64, channels: 3, background: "#227766" } }).png().toBuffer();
  const product = await call(seller, `const categories = await api.categories.tree(); const leaf = categories.flatMap(r => r.children?.length ? r.children : [r]).find(r => r.status === 'ACTIVE'); const uploaded = await api.uploads.upload(new File([new Uint8Array(${JSON.stringify([...png])})], 'smoke.png', {type:'image/png'}), 'product'); return api.products.create({title:'Sản phẩm kiểm thử end to end',description:'Mô tả sản phẩm đủ dài cho kiểm thử lifecycle trên backend thật.',category_id:leaf.id,price:'100000',condition:'GOOD',usage_months:null,province_code:'VN-52',delivery_method:'COD',shipping_fee:'30000',images:[{...uploaded,sort_order:0}]});`);
  assert.equal(product.status, "PENDING");
  await visit(seller, `/account/products/${product.id}/edit`, "Chỉnh sửa tin đăng", "product-edit-desktop");
  await call(admin, `return api.admin.approveProduct(${JSON.stringify(product.id)}, ${product.version});`);
  await visit(buyer, `/products/${product.id}`, product.title, "product-detail-mobile", true);
  await call(buyer, `await api.favorites.set(${JSON.stringify(product.id)}, true); await api.cart.add(${JSON.stringify(product.id)}); return api.cart.get();`);
  await visit(buyer, "/favorites", product.title, "favorites-live-mobile", true);
  await visit(buyer, "/cart", product.title, "cart-live-desktop");
  await visit(buyer, `/checkout?items=${product.id}`, "Đặt hàng", "checkout-mobile", true);
  await wait(buyer, `Boolean(document.getElementById(${JSON.stringify('recipient-')} + ${JSON.stringify(product.seller.id)}))`, "checkout recipient loaded");
  await fill(buyer, `[id="recipient-${product.seller.id}"]`, "Người mua kiểm thử");
  await fill(buyer, `[id="phone-${product.seller.id}"]`, "0900000000");
  await fill(buyer, `[id="address-${product.seller.id}"]`, "1 Đường kiểm thử, Hà Nội");
  await wait(buyer, "Boolean([...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Đặt hàng' && !b.disabled))", "checkout metadata ready");
  await click(buyer, "Đặt hàng");
  await wait(buyer, "location.pathname.startsWith('/orders/')", "checkout submitted UI");
  let order = await call(buyer, "return api.orders.detail(location.pathname.split('/').at(-1));");
  await visit(seller, `/sales/${order.id}`, "Xác nhận đơn hàng", "seller-order-desktop");
  await click(seller, "Xác nhận đơn hàng");
  await wait(seller, "Boolean([...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Giao hàng' && !b.disabled))", "order confirmed UI");
  order = await call(seller, `const order = await api.orders.detail(${JSON.stringify(order.id)}); return api.orders.act(order.id,'ship',{expected_version:order.version,carrier:'Kiểm thử',tracking_code:'TEST123'});`);
  order = await call(buyer, `return api.orders.act(${JSON.stringify(order.id)},'deliver',{expected_version:${order.version}});`);
  await visit(buyer, `/orders/${order.id}`, "Hành động", "buyer-order-mobile", true);
  order = await call(buyer, `return api.orders.act(${JSON.stringify(order.id)},'complete',{expected_version:${order.version},buyer_confirmed_received:true,buyer_confirmed_paid:true});`);
  assert.equal(order.status, "COMPLETED");
  await call(buyer, `return api.reviews.create(${JSON.stringify(order.id)},{rating:5,comment:'Giao dịch kiểm thử thành công',expected_version:${order.version}});`);
  assert.equal((await call(buyer, `return api.products.detail(${JSON.stringify(product.id)});`)).status, "SOLD");
  console.log("PASS: live adapter upload -> listing -> approval -> favorites/cart -> checkout -> delivery -> completion -> review");
  await call(admin, `const current = await api.products.detail(${JSON.stringify(product.id)}); return api.admin.blockProduct(current.id,current.version,'Kiểm tra ảnh snapshot sau khi tin bị ẩn');`);
  await visit(buyer, `/orders/${order.id}`, "Hành động", "order-hidden-listing-snapshot", true);
  assert(await evaluate(buyer, "Boolean([...document.querySelectorAll('img')].find(img => img.src.includes('/api/v1/uploads/') && img.src.includes('signature=') && img.naturalWidth > 0))"), "Order participant must see the signed snapshot image after the listing is hidden");
  for (const [route, text] of [["/admin", "Tổng user"], ["/admin/users", "Người dùng"], ["/admin/products", "Tin đăng"], ["/admin/categories", "Danh mục"], ["/admin/reports", "Báo cáo"], ["/admin/reviews", "Đánh giá"], ["/admin/support", "Hỗ trợ"], ["/admin/audit", "Nhật ký"]]) await visit(admin, route, text, route === "/admin" ? "admin-dashboard" : route.replaceAll("/", "-").slice(1));
  await visit(admin, "/admin/reviews", "Đánh giá", "admin-reviews-ready");
  await click(admin, "Xem");
  await wait(admin, "document.body.innerText.includes('Chi tiết đánh giá')", "admin review drawer");
  await screenshot(admin, "admin-review-drawer"); checks.push("admin-review-drawer");
  const locked = await tabFor("long.bi.khoa@remarket.vn");
  await visit(locked, "/support/new", "Gửi yêu cầu", "locked-support-mobile", true);
  await locked.send("Page.navigate", { url: web + "/messages" });
  await wait(locked, "location.pathname === '/orders'", "locked inbox redirects to allowed orders");
  checks.push("locked-inbox-blocked");
  }
  assert.equal(exceptions.length, 0, `Uncaught browser errors: ${exceptions.join("\n")}`);
  assert.equal(failures.length, 0, `5xx responses: ${JSON.stringify(failures)}`);
  await writeFile(path.join(artifacts, process.env.SMOKE_EMAIL_ONLY === "true" ? "results-email.json" : process.env.SMOKE_LIFECYCLE_ONLY === "true" ? "results-lifecycle.json" : "results.json"), JSON.stringify({ checks, uncaughtErrors: exceptions, serverFailures: failures }, null, 2));
  console.log(`PASS: ${checks.length} responsive screen checks; no uncaught browser exceptions or 5xx responses`);
} finally {
  if (browser) await browser.send("Browser.close").catch(() => undefined);
  for (const client of clients) client.close();
  if (chrome.exitCode === null) { chrome.kill(); await new Promise((resolve) => { chrome.once("exit", resolve); setTimeout(resolve, 5000); }); }
  if (path.dirname(profile) === path.resolve(tmpdir()) && path.basename(profile).startsWith("remarket-member-smoke-")) await rm(profile, { recursive: true, force: true });
}
