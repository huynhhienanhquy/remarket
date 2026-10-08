import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@remarket/shared";

const user: SessionUser = { id: "user-1", role: "ADMIN", status: "ACTIVE", full_name: "Admin", email: "admin@example.test", avatar_url: null, email_verified_at: null, phone: null, province_code: null, default_address: null, joined_at: "2026-01-01" };
const envelope = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status });
const failure = (status: number, code: string) => new Response(JSON.stringify({ success: false, error: { code, message: code } }), { status });
let transport: typeof import("./http");
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let session: typeof import("./session");

beforeEach(async () => {
  vi.resetModules();
  transport = await import("./http");
  session = await import("./session");
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("shared session restoration", () => {
  it("uses the identity returned by login without a second me request", async () => {
    const { createHttpAdapter } = await import("./httpAdapter");
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
      if (String(url).endsWith("/auth/bootstrap")) return envelope({ user, access_token: "new-token" });
      if ((options?.headers as Record<string, string>).Authorization === "Bearer old-token") return failure(401, "SESSION_EXPIRED");
      return envelope({ ok: true });
    });
    await expect(Promise.all([transport.http.get("/orders"), transport.http.get("/notifications")])).resolves.toEqual([{ ok: true }, { ok: true }]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/auth/bootstrap"))).toHaveLength(1);
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
});
