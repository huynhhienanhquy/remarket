import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { SessionUser } from "@remarket/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, useSession } from "./SessionProvider";
import { RequireAdmin } from "./guards";
import { api } from "../lib/api";
import { http } from "../lib/api/http";

vi.mock("../lib/api", async () => {
  const { createHttpAdapter } = await import("../lib/api/httpAdapter");
  return { api: createHttpAdapter() };
});
const admin: SessionUser = {
  id: "admin-account", full_name: "Admin", email: "admin@example.test", role: "ADMIN", status: "ACTIVE",
  avatar_url: null, phone: null, province_code: null, default_address: null,
  joined_at: "2026-10-01T00:00:00Z", email_verified_at: "2026-10-01T00:00:00Z",
};
const member: SessionUser = { ...admin, id: "member-account", role: "USER" };
const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data }), { status: 200 });
const denied = (status: number, code: string) => new Response(JSON.stringify({ success: false, error: { code, message: code } }), { status });
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
let client: QueryClient;

function AdminProbe() {
  const { viewer } = useSession();
  return <div>
    <div>Admin screen: {viewer?.id}</div>
    <button onClick={() => { void api.admin.dashboard("2026-09-08", "2026-10-07").catch(() => undefined); }}>Tải dữ liệu admin</button>
  </div>;
}
function AutoAdminProbe() {
  const query = useQuery({ queryKey: ["admin", "automatic"], queryFn: () => api.admin.dashboard("2026-09-08", "2026-10-07") });
  return <div>Admin screen: admin-account{query.isError && <div>Admin API bị từ chối</div>}</div>;
}
async function mountAdmin(automatic = false) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><SessionProvider><MemoryRouter initialEntries={["/admin"]}><Routes>
    <Route path="/admin" element={<RequireAdmin>{automatic ? <AutoAdminProbe /> : <AdminProbe />}</RequireAdmin>} />
    <Route path="/403" element={<div>Không có quyền admin</div>} />
    <Route path="/orders" element={<div>Tài khoản hạn chế</div>} />
    <Route path="/login" element={<div>Cần đăng nhập</div>} />
  </Routes></MemoryRouter></SessionProvider></QueryClientProvider>);
  await screen.findByText("Admin screen: admin-account");
  client.setQueryData(["admin", "cached-private-data"], { private: "previous-admin-data" });
}
beforeEach(() => {
  http.setAccessToken(null);
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); http.setAccessToken(null); });

describe("admin session recovery through the real HTTP adapter", () => {
  it("removes stale admin UI/cache when a 401 restores a different USER account", async () => {
    let bootstraps = 0;
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/auth/bootstrap") || String(url).includes("/auth/refresh")) return ok({ user: ++bootstraps === 1 ? admin : member, access_token: `token-${bootstraps}` });
      if (String(url).includes("/auth/me")) return ok(member);
      return denied(401, "SESSION_EXPIRED");
    });
    await mountAdmin();
    await userEvent.click(screen.getByRole("button", { name: "Tải dữ liệu admin" }));
    expect(await screen.findByText("Không có quyền admin")).toBeInTheDocument();
    expect(screen.queryByText("Admin screen: admin-account")).not.toBeInTheDocument();
    expect(client.getQueryData(["admin", "cached-private-data"])).toBeUndefined();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/admin/dashboard"))).toHaveLength(1);
  });
  it.each(["USER", "LOCKED"] as const)("rechecks identity on an admin 403 and leaves stale admin content (%s)", async (change) => {
    const current = change === "USER" ? { ...admin, role: "USER" as const } : { ...admin, status: "LOCKED" as const };
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/auth/bootstrap")) return ok({ user: admin, access_token: "admin-token" });
      if (String(url).includes("/auth/me")) return ok(current);
      return denied(403, change === "USER" ? "FORBIDDEN" : "ACCOUNT_LOCKED");
    });
    await mountAdmin();
    await userEvent.click(screen.getByRole("button", { name: "Tải dữ liệu admin" }));
    expect(await screen.findByText(change === "USER" ? "Không có quyền admin" : "Tài khoản hạn chế")).toBeInTheDocument();
    expect(client.getQueryData(["admin", "cached-private-data"])).toBeUndefined();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/admin/dashboard"))).toHaveLength(1);
  });
  it("never resubmits a moderation mutation after recovery switches accounts", async () => {
    let bootstraps = 0;
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/auth/bootstrap") || String(url).includes("/auth/refresh")) return ok({ user: ++bootstraps === 1 ? admin : { ...admin, id: "another-admin" }, access_token: `token-${bootstraps}` });
      return denied(401, "SESSION_EXPIRED");
    });
    await mountAdmin();
    await act(async () => {
      await expect(api.admin.approveProduct("listing", 1)).rejects.toMatchObject({ code: "SESSION_CHANGED" });
    });
    await waitFor(() => expect(screen.getByText("Admin screen: another-admin")).toBeInTheDocument());
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/approve"))).toHaveLength(1);
    expect(client.getQueryData(["admin", "cached-private-data"])).toBeUndefined();
  });
  it("hides private data while identity is checked and does not treat a DB failure as guest", async () => {
    let finish: ((response: Response) => void) | undefined;
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/auth/bootstrap")) return ok({ user: admin, access_token: "admin-token" });
      if (String(url).includes("/auth/me")) return new Promise<Response>((resolve) => { finish = resolve; });
      return denied(403, "FORBIDDEN");
    });
    await mountAdmin();
    await userEvent.click(screen.getByRole("button", { name: "Tải dữ liệu admin" }));
    expect(screen.getByText("Admin screen: admin-account")).not.toBeVisible();
    await act(async () => { finish!(denied(500, "INTERNAL")); });
    expect(await screen.findByText("Chưa thể kiểm tra phiên đăng nhập")).toBeInTheDocument();
    expect(screen.queryByText("Cần đăng nhập")).not.toBeInTheDocument();
    expect(client.getQueryData(["admin", "cached-private-data"])).toBeUndefined();
    await userEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(await screen.findByText("Admin screen: admin-account")).toBeInTheDocument();
  });
  it("does not remount/refetch forever when a legitimate 403 leaves ADMIN permissions unchanged", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/auth/bootstrap")) return ok({ user: admin, access_token: "admin-token" });
      if (String(url).includes("/auth/me")) return ok(admin);
      return denied(403, "FORBIDDEN");
    });
    await mountAdmin(true);
    expect(await screen.findByText("Admin API bị từ chối")).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/admin/dashboard"))).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/auth/me"))).toHaveLength(1);
  });
  it("does not let an old identity-validation response hide a newly authenticated admin", async () => {
    let finish!: (response: Response) => void;
    const another = { ...admin, id: "another-admin" };
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/auth/bootstrap")) return ok({ user: admin, access_token: "admin-token" });
      if (String(url).includes("/auth/me")) return new Promise<Response>((resolve) => { finish = resolve; });
      if (String(url).includes("/auth/login")) return ok({ user: another, access_token: "another-token" });
      return denied(403, "FORBIDDEN");
    });
    await mountAdmin();
    await userEvent.click(screen.getByRole("button", { name: "Tải dữ liệu admin" }));
    await act(async () => { await api.auth.login(another.email, "password"); finish(ok(admin)); });
    expect(await screen.findByText("Admin screen: another-admin")).toBeVisible();
    expect(screen.queryByText("Chưa thể kiểm tra phiên đăng nhập")).not.toBeInTheDocument();
  });
  it("preserves local identity if manual validation gets 401 then a retryable refresh failure", async () => {
    fetchMock.mockImplementation(async (url) => {
      if (String(url).includes("/auth/bootstrap")) return ok({ user: admin, access_token: "admin-token" });
      if (String(url).includes("/auth/me")) return denied(401, "SESSION_EXPIRED");
      if (String(url).includes("/auth/refresh")) return denied(503, "RETRY_LATER");
      return denied(403, "FORBIDDEN");
    });
    await mountAdmin();
    await userEvent.click(screen.getByRole("button", { name: "Tải dữ liệu admin" }));
    expect(await screen.findByText("Chưa thể kiểm tra phiên đăng nhập")).toBeInTheDocument();
    expect(http.getAccessToken()).toBe("admin-token");
    expect(screen.queryByText("Cần đăng nhập")).not.toBeInTheDocument();
  });
});
