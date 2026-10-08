import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import type { SessionUser } from "@remarket/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { SessionProvider } from "../../app/SessionProvider";
import { GuestOnly } from "../../app/guards";
import { ApiError } from "../../lib/errors";
import { LoginPage } from "./LoginPage";

vi.mock("../../lib/api", () => ({ api: { auth: { bootstrap: vi.fn(), login: vi.fn() } } }));

const account: SessionUser = {
  id: "authenticated-account",
  full_name: "Tài khoản kiểm thử",
  email: "account@example.com",
  role: "USER",
  status: "ACTIVE",
  avatar_url: null,
  email_verified_at: "2026-10-07T00:00:00Z",
  phone: null,
  province_code: null,
  default_address: null,
  joined_at: "2026-10-01T00:00:00Z",
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="destination">{location.pathname}{location.search}</div>;
}

function renderLogin(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  client.setQueryData(["previous-account-private-data"], { secret: "old-session" });
  render(<QueryClientProvider client={client}><SessionProvider><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/login" element={<GuestOnly><LoginPage /></GuestOnly>} />
    <Route path="*" element={<LocationProbe />} />
  </Routes></MemoryRouter></SessionProvider></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.auth.bootstrap).mockResolvedValue(null);
});

describe("one login page for user and admin", () => {
  it.each([
    ["ADMIN", "ACTIVE", "/login", "/admin"],
    ["ADMIN", "ACTIVE", "/login?returnTo=%2F", "/admin"],
    ["ADMIN", "ACTIVE", "/login?returnTo=%2Fadmin%2Fusers", "/admin/users"],
    ["USER", "ACTIVE", "/login", "/"],
    ["USER", "ACTIVE", "/login?returnTo=%2Fadmin", "/"],
    ["USER", "ACTIVE", "/login?returnTo=%2Fcheckout%3Fitems%3D123", "/checkout?items=123"],
    ["USER", "LOCKED", "/login?returnTo=%2Fcheckout", "/orders"],
  ] as const)("routes the API's %s/%s response from %s to %s", async (role, status, path, expected) => {
    vi.mocked(api.auth.login).mockResolvedValue({ ...account, role, status });
    const client = renderLogin(path);
    const user = userEvent.setup();
    // The same credentials/form work for both roles; only the API result differs.
    await user.type(await screen.findByLabelText(/^Email/), account.email);
    await user.type(screen.getByLabelText(/^Mật khẩu/), "Valid-test-password");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    expect((await screen.findByTestId("destination")).textContent).toBe(expected);
    expect(api.auth.login).toHaveBeenCalledWith(account.email, "Valid-test-password");
    expect(client.getQueryData(["previous-account-private-data"])).toBeUndefined();
    client.clear();
  });

  it("stays on the same form with an error when authentication fails", async () => {
    vi.mocked(api.auth.login).mockRejectedValue(new ApiError({ code: "UNAUTHORIZED", status: 401, message: "Email hoặc mật khẩu không đúng." }));
    const client = renderLogin("/login?returnTo=%2Fadmin");
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/^Email/), account.email);
    await user.type(screen.getByLabelText(/^Mật khẩu/), "Wrong-test-password");
    await user.click(screen.getByRole("button", { name: "Đăng nhập" }));
    await waitFor(() => expect(screen.getByText("Email hoặc mật khẩu không đúng.")).toBeInTheDocument());
    expect(screen.queryByTestId("destination")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveValue(account.email);
    client.clear();
  });
});
