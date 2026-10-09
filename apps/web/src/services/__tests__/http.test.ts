import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@remarket/shared";

const user: SessionUser = { id: "user-1", role: "ADMIN", status: "ACTIVE", full_name: "Admin", email: "admin@example.test", avatar_url: null, email_verified_at: null, phone: null, province_code: null, default_address: null, joined_at: "2026-01-01" };
const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const failure = (status: number, code: string) => new Response(JSON.stringify({ success: false, error: { code, message: code } }), { status });
let transport: typeof import("../http");
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let session: typeof import("../../stores/sessionStore");

beforeEach(async () => {
  window.sessionStorage.clear();
  vi.resetModules();
  transport = await import("../http");
  session = await import("../../stores/sessionStore");
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("shared session restoration", () => {
  it("uses the identity returned by login without a second me request", async () => {
    const { createHttpAdapter } = await import("../httpAdapter");
    const httpAdapter = createHttpAdapter();
    fetchMock.mockResolvedValue(envelope({ user, access_token: "login-token" }));
    expect(await httpAdapter.auth.login(user.email, "password")).toEqual(user);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/auth/login");
    expect(transport.getAccessToken()).toBe("login-token");
  });
  it("shares bootstrap across StrictMode calls and treats guests as 200/null", async () => {
    fetchMock.mockResolvedValue(envelope({ user: null, access_token: null }));
    const first = transport.restoreSession();
    const second = transport.restoreSession();
    expect(first).toBe(second);
    expect(await first).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/auth/bootstrap");
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST", credentials: "include" });
  });
  it("restores the server role and keeps the access token in memory", async () => {
    fetchMock.mockResolvedValue(envelope({ user, access_token: "new-token" }));
    expect(await transport.restoreSession()).toEqual(user);
    expect(transport.getAccessToken()).toBe("new-token");
  });
  it("shares one restoration for parallel protected 401s", async () => {
    session.updateSessionUser(user);
    transport.setAccessToken("old-token");
    fetchMock.mockImplementation(async (url, options) => {
      if (String(url).endsWith("/auth/refresh")) return envelope({ user, access_token: "new-token" });
      if ((options?.headers as Record<string, string>).Authorization === "Bearer old-token") return failure(401, "SESSION_EXPIRED");
      return envelope({ ok: true });
    });
    await expect(Promise.all([transport.http.get("/orders"), transport.http.get("/notifications")])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/refresh"))).toHaveLength(1);
  });
  it("does not rotate again for a delayed 401 belonging to the previous token", async () => {
    transport.setAccessToken("old-token");
    let deliver: ((response: Response) => void) | undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { deliver = resolve; })).mockResolvedValue(envelope({ ok: true }));
    const pending = transport.http.get("/orders");
    transport.setAccessToken("new-token");
    deliver!(failure(401, "SESSION_EXPIRED"));
    await pending;
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/auth/"))).toHaveLength(0);
    expect(fetchMock.mock.calls[1]![1]?.headers).toMatchObject({ Authorization: "Bearer new-token" });
  });
  it("wrong login credentials do not refresh cookies or expire another session", async () => {
    const expired = vi.spyOn(window, "dispatchEvent");
    fetchMock.mockResolvedValue(failure(401, "UNAUTHORIZED"));
    await expect(transport.http.post("/auth/login", { email: "wrong@example.test", password: "bad" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(expired).not.toHaveBeenCalled();
  });
  it.each([500, 409])("propagates restoration failure %s without pretending the user logged out", async (status) => {
    transport.setAccessToken("old-token");
    const expired = vi.spyOn(window, "dispatchEvent");
    fetchMock.mockResolvedValueOnce(failure(401, "SESSION_EXPIRED")).mockResolvedValueOnce(failure(status, "RETRY_LATER"));
    await expect(transport.http.get("/orders")).rejects.toMatchObject({ status, code: "RETRY_LATER" });
    expect(transport.getAccessToken()).toBe("old-token");
    expect(expired).not.toHaveBeenCalled();
  });
  it("notifies expiry only once when parallel requests discover an empty session", async () => {
    const expired = vi.spyOn(window, "dispatchEvent");
    fetchMock.mockImplementation(async (url) => String(url).endsWith("/auth/bootstrap")
      ? envelope({ user: null, access_token: null }) : failure(401, "SESSION_EXPIRED"));
    const outcomes = await Promise.allSettled([transport.http.get("/orders"), transport.http.get("/notifications")]);
    expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(true);
    expect(expired).toHaveBeenCalledTimes(1);
  });
  it("never blindly retries an admin mutation on 409", async () => {
    fetchMock.mockResolvedValue(failure(409, "VERSION_CONFLICT"));
    await expect(transport.http.post("/admin/products/id/approve", { expected_version: 1 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cannot restore a late bootstrap after a deliberate local logout", async () => {
    let deliver!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { deliver = resolve; }));
    const pending = transport.restoreSession();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const rejected = expect(pending).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    transport.setAccessToken(null);
    deliver(envelope({ user, access_token: "stale-token" }));
    await rejected;
    expect(transport.getAccessToken()).toBeNull();
    expect(session.getSessionUser()).toBeNull();
  });

  it("serializes a pending login with logout without reviving the old identity", async () => {
    const adapter = (await import("../httpAdapter")).createHttpAdapter();
    let deliver!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { deliver = resolve; })).mockResolvedValue(envelope({ ok: true }));
    const login = adapter.auth.login(user.email, "password");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const rejected = expect(login).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    const logout = adapter.auth.logout();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    deliver(envelope({ user, access_token: "stale-login" }));
    await rejected; await logout;
    expect(String(fetchMock.mock.calls[1]![0])).toContain("/auth/logout");
    expect(transport.getAccessToken()).toBeNull();
    expect(session.getSessionUser()).toBeNull();
  });

  it("rejects a private response if identity changes while its JSON is still streaming", async () => {
    let body!: (value: unknown) => void;
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => new Promise((resolve) => { body = resolve; }) } as unknown as Response);
    const pending = transport.http.get("/orders");
    await vi.waitFor(() => expect(body).toBeTypeOf("function"));
    session.updateSessionUser(user);
    body({ success: true, data: { private: "previous-user" } });
    await expect(pending).rejects.toMatchObject({ code: "SESSION_CHANGED" });
  });

  it("clears access and identity after password reset, but preserves them on failure", async () => {
    const adapter = (await import("../httpAdapter")).createHttpAdapter();
    transport.setAccessToken("current-token"); session.updateSessionUser(user);
    fetchMock.mockResolvedValueOnce(failure(422, "VALIDATION_ERROR")).mockResolvedValueOnce(envelope({ accepted: true }));
    await expect(adapter.auth.resetPassword("bad", "password")).rejects.toMatchObject({ status: 422 });
    expect(transport.getAccessToken()).toBe("current-token");
    expect(session.getSessionUser()).toEqual(user);
    await adapter.auth.resetPassword("valid", "password");
    expect(transport.getAccessToken()).toBeNull();
    expect(session.getSessionUser()).toBeNull();
  });

  it("stops recovery after a second 401 and notifies session expiry", async () => {
    transport.setAccessToken("old-token"); session.updateSessionUser(user);
    const expired = vi.spyOn(window, "dispatchEvent");
    fetchMock.mockImplementation(async (url) => String(url).endsWith("/auth/refresh")
      ? envelope({ user, access_token: "new-token" }) : failure(401, "SESSION_EXPIRED"));
    await expect(transport.http.get("/orders")).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(transport.getAccessToken()).toBeNull();
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it("revalidates locked marketplace identity without replaying the denied operation", async () => {
    transport.setAccessToken("token"); session.updateSessionUser(user);
    fetchMock.mockResolvedValueOnce(failure(403, "ACCOUNT_LOCKED")).mockResolvedValueOnce(envelope({ ...user, status: "LOCKED" }));
    await expect(transport.http.post("/cart/items", { product_id: "p" })).rejects.toMatchObject({ code: "ACCOUNT_LOCKED" });
    expect(session.getSessionUser()?.status).toBe("LOCKED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not replace a real session with a malformed successful auth response", async () => {
    transport.setAccessToken("current-token"); session.updateSessionUser(user);
    fetchMock.mockResolvedValue(envelope({ access_token: "missing-identity" }));
    await expect(transport.restoreSession()).rejects.toMatchObject({ code: "INVALID_AUTH_RESPONSE" });
    expect(transport.getAccessToken()).toBe("current-token");
    expect(session.getSessionUser()).toEqual(user);
  });
  it.each([{ user: null, access_token: null }, { user: { ...user, role: "SUPERUSER" }, access_token: "token" }])("rejects an empty or unsupported login identity without destroying the current session", async (data) => {
    transport.setAccessToken("current-token"); session.updateSessionUser(user);
    fetchMock.mockResolvedValue(envelope(data));
    await expect((await import("../httpAdapter")).createHttpAdapter().auth.login(user.email, "password")).rejects.toMatchObject({ code: "INVALID_AUTH_RESPONSE" });
    expect(transport.getAccessToken()).toBe("current-token");
    expect(session.getSessionUser()).toEqual(user);
  });

  it("uses a scope-specific browser lock for bootstrap, refresh and credential changes", async () => {
    const lock = vi.fn(async (_name: string, action: () => Promise<unknown>) => action());
    Object.defineProperty(navigator, "locks", { configurable: true, value: { request: lock } });
    try {
      fetchMock.mockImplementation(async () => envelope({ user, access_token: "token" }));
      await transport.restoreSession(); await transport.restoreSession("refresh");
      await (await import("../httpAdapter")).createHttpAdapter().auth.login(user.email, "password");
      expect(lock).toHaveBeenCalledTimes(3);
      const scope = (fetchMock.mock.calls[0]![1]?.headers as Record<string, string>)["X-Session-Scope"];
      expect(lock.mock.calls.every(([name]) => name === `remarket-auth-cookie:${scope}`)).toBe(true);
    } finally { Reflect.deleteProperty(navigator, "locks"); }
  });

  it("ignores changes from other scopes and revalidates only tabs sharing its cookie", async () => {
    const channels: FakeChannel[] = [];
    class FakeChannel {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      postMessage = vi.fn(); close = vi.fn();
      constructor(public name: string) { channels.push(this); }
    }
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const stop = transport.listenForSessionChanges();
    const adapter = (await import("../httpAdapter")).createHttpAdapter();
    fetchMock.mockResolvedValue(envelope({ user, access_token: "private-token" }));
    await adapter.auth.login(user.email, "password");
    const message = channels[1]!.postMessage.mock.calls[0]![0];
    expect(Object.keys(message).sort()).toEqual(["scope", "sender", "type"]);
    expect(JSON.stringify(message)).not.toContain("private-token");
    channels[0]!.onmessage!(new MessageEvent("message", { data: message }));
    expect(transport.getAccessToken()).toBe("private-token");
    const dispatch = vi.spyOn(window, "dispatchEvent");
    channels[0]!.onmessage!(new MessageEvent("message", { data: { type: "cookie-changed", sender: "other-tab" } }));
    channels[0]!.onmessage!(new MessageEvent("message", { data: { ...message, sender: "other-tab", scope: crypto.randomUUID() } }));
    expect(transport.getAccessToken()).toBe("private-token");
    expect(session.getSessionUser()).toEqual(user);
    expect(dispatch).not.toHaveBeenCalled();
    channels[0]!.onmessage!(new MessageEvent("message", { data: { ...message, sender: "other-tab" } }));
    expect(transport.getAccessToken()).toBeNull();
    expect(session.getSessionUser()).toBeNull();
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: transport.SESSION_COOKIE_CHANGED_EVENT }));
    stop(); expect(channels[0]!.close).toHaveBeenCalledOnce();
  });
  it("does not fail authentication when the browser disables BroadcastChannel", async () => {
    vi.stubGlobal("BroadcastChannel", class { constructor() { throw new DOMException("Disabled", "SecurityError"); } });
    expect(() => transport.listenForSessionChanges()()).not.toThrow();
    fetchMock.mockResolvedValue(envelope({ user, access_token: "token" }));
    await expect((await import("../httpAdapter")).createHttpAdapter().auth.login(user.email, "password")).resolves.toEqual(user);
  });
});
