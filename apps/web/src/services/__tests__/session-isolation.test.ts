import type { SessionUser } from "@remarket/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storageKey = "remarket:session-scope";
const admin: SessionUser = { id: "admin", role: "ADMIN", status: "ACTIVE", full_name: "Admin", email: "admin@example.test", avatar_url: null, email_verified_at: "2026-01-01", phone: null, province_code: null, default_address: null, joined_at: "2026-01-01" };
const buyer: SessionUser = { ...admin, id: "buyer", role: "USER", full_name: "Buyer", email: "buyer@example.test" };
const seller: SessionUser = { ...buyer, id: "seller", full_name: "Seller", email: "seller@example.test" };
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
const denied = () => new Response(JSON.stringify({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } }), { status: 401 });
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let cookies: Map<string, { user: SessionUser; access_token: string }>;

/** Independent module instances model separate tabs sharing the browser's cookie jar. */
async function tab(savedScope?: string) {
  window.sessionStorage.clear();
  if (savedScope) window.sessionStorage.setItem(storageKey, savedScope);
  vi.resetModules();
  const scope = await import("../../stores/sessionScope");
  scope.getSessionScope();
  const transport = await import("../http");
  const session = await import("../../stores/sessionStore");
  const adapter = (await import("../httpAdapter")).createHttpAdapter();
  return { scope, transport, session, adapter };
}

beforeEach(() => {
  cookies = new Map();
  fetchMock = vi.fn<typeof fetch>(async (url, options) => {
    const path = new URL(String(url)).pathname;
    const headers = new Headers(options?.headers);
    const scope = headers.get("X-Session-Scope")!;
    if (path.endsWith("/auth/login")) {
      const input = JSON.parse(String(options?.body)) as { email: string; password: string };
      const user = [admin, buyer, seller].find((item) => item.email === input.email);
      if (!user || input.password !== "password") return denied();
      const credentials = { user, access_token: `${user.id}-${crypto.randomUUID()}` };
      cookies.set(scope, credentials);
      return ok(credentials);
    }
    if (path.endsWith("/auth/bootstrap") || path.endsWith("/auth/refresh")) {
      const credentials = cookies.get(scope);
      if (credentials && path.endsWith("/auth/refresh")) credentials.access_token = `${credentials.user.id}-${crypto.randomUUID()}`;
      return ok(credentials ?? { user: null, access_token: null });
    }
    if (path.endsWith("/auth/logout")) {
      cookies.delete(scope);
      return ok({ ok: true });
    }
    const credentials = cookies.get(scope);
    if (headers.get("Authorization") !== `Bearer ${credentials?.access_token}`) return denied();
    return ok(credentials?.user);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { window.sessionStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("independent browser-tab sessions", () => {
  it("keeps admin, buyer and seller isolated through parallel refresh, focus bootstrap and logout", async () => {
    const a = await tab();
    await a.adapter.auth.login(admin.email, "password");
    const b = await tab();
    expect(await b.adapter.auth.bootstrap()).toBeNull();
    await b.adapter.auth.login(buyer.email, "password");
    const c = await tab();
    await c.adapter.auth.login(seller.email, "password");
    expect(new Set([a, b, c].map((item) => item.scope.getSessionScope())).size).toBe(3);
    for (const item of [a, b, c]) item.transport.setAccessToken("expired");
    expect(await Promise.all([a, b, c].map((item) => item.adapter.auth.me()))).toEqual([admin, buyer, seller]);
    expect(await a.adapter.auth.bootstrap()).toEqual(admin);
    expect(await b.adapter.auth.bootstrap()).toEqual(buyer);
    await b.adapter.auth.logout();
    expect(await b.adapter.auth.bootstrap()).toBeNull();
    expect(await a.adapter.auth.me()).toEqual(admin);
    expect(await c.adapter.auth.me()).toEqual(seller);
    expect(a.session.getSessionUser()).toEqual(admin);
    expect(c.session.getSessionUser()).toEqual(seller);
  });

  it("restores only the saved tab scope on reload without persisting tokens or identity", async () => {
    const a = await tab();
    await a.adapter.auth.login(admin.email, "password");
    const scopeA = a.scope.getSessionScope();
    const b = await tab();
    await b.adapter.auth.login(buyer.email, "password");
    expect(window.sessionStorage.length).toBe(1);
    expect(window.sessionStorage.getItem(storageKey)).toBe(b.scope.getSessionScope());
    const reloadedA = await tab(scopeA);
    expect(reloadedA.transport.getAccessToken()).toBeNull();
    expect(await reloadedA.adapter.auth.bootstrap()).toEqual(admin);
    expect(await b.adapter.auth.me()).toEqual(buyer);
  });

  it("uses a fresh scope when signing into a different account from a copied tab", async () => {
    const a = await tab();
    await a.adapter.auth.login(admin.email, "password");
    const original = a.scope.getSessionScope();
    const b = await tab(original);
    await b.adapter.auth.login(buyer.email, "password");
    expect(b.scope.getSessionScope()).not.toBe(original);
    expect(await a.adapter.auth.bootstrap()).toEqual(admin);
    expect(await b.adapter.auth.bootstrap()).toEqual(buyer);
  });

  it("preserves the previous scope and identity after a failed login", async () => {
    const a = await tab();
    await a.adapter.auth.login(admin.email, "password");
    const original = a.scope.getSessionScope();
    await expect(a.adapter.auth.login(buyer.email, "wrong")).rejects.toMatchObject({ status: 401 });
    expect(a.scope.getSessionScope()).toBe(original);
    expect(a.session.getSessionUser()).toEqual(admin);
    expect(await a.adapter.auth.bootstrap()).toEqual(admin);
  });

  it("keeps authentication usable when sessionStorage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    const a = await tab();
    await a.adapter.auth.login(admin.email, "password");
    expect(await a.adapter.auth.me()).toEqual(admin);
  });
});
