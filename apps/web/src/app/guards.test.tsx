import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@remarket/shared";
import { useSession } from "./SessionProvider";
import { GuestOnly, RequireAdmin, RequireVerified, postLoginPath, safeReturnTo } from "./guards";

vi.mock("./SessionProvider", () => ({
  useSession: vi.fn(),
}));

const mockedUseSession = vi.mocked(useSession);

const viewer: SessionUser = {
  id: "user-1",
  full_name: "Người bán",
  email: "seller@example.com",
  avatar_url: null,
  role: "USER",
  status: "ACTIVE",
  email_verified_at: null,
  phone: null,
  province_code: null,
  default_address: null,
  joined_at: "2026-01-01T00:00:00.000Z",
};

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderGuard() {
  return render(
    <MemoryRouter initialEntries={["/account/products/new?draft=1"]}>
      <Routes>
        <Route
          path="/account/products/new"
          element={<RequireVerified><div>Form đăng tin</div></RequireVerified>}
        />
        <Route path="/verify-email" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireVerified", () => {
  beforeEach(() => {
    mockedUseSession.mockReset();
  });

  it("redirects an unverified seller to verification and preserves the return path", async () => {
    mockedUseSession.mockReturnValue({
      viewer,
      status: "ready",
      refresh: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      expire: vi.fn(),
    });

    renderGuard();

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/verify-email?email=seller%40example.com&returnTo=%2Faccount%2Fproducts%2Fnew%3Fdraft%3D1",
      );
    });
  });

  it("renders product management for a verified seller", () => {
    mockedUseSession.mockReturnValue({
      viewer: { ...viewer, email_verified_at: "2026-10-07T00:00:00.000Z" },
      status: "ready",
      refresh: vi.fn(),
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      expire: vi.fn(),
    });

    renderGuard();

    expect(screen.getByText("Form đăng tin")).toBeInTheDocument();
  });
});

describe("shared role-based login destination", () => {
  it.each([
    ["ADMIN", undefined, "/admin"],
    ["ADMIN", "/", "/admin"],
    ["ADMIN", "/products?category_id=1", "/admin"],
    ["ADMIN", "/admin/products?status=PENDING#queue", "/admin/products?status=PENDING#queue"],
    ["USER", undefined, "/"],
    ["USER", "/admin", "/"],
    ["USER", "/Admin/users?selected=123", "/"],
    ["USER", "/%61dmin/users", "/"],
    ["USER", "/products/../admin/users", "/"],
    ["USER", "/checkout?items=123", "/checkout?items=123"],
    ["USER", "/orders/abc?tab=history", "/orders/abc?tab=history"],
    ["USER", "/admin-tools", "/admin-tools"],
    ["USER", "/login?returnTo=%2Fadmin", "/"],
    ["ADMIN", "/register", "/admin"],
  ] as const)("routes %s with returnTo %s to %s", (role, returnTo, expected) => {
    expect(postLoginPath({ role, status: "ACTIVE" }, returnTo)).toBe(expected);
  });

  it.each(["https://example.com", "//example.com", "/\\example.com", "/%5Cexample.com", "/%2Fexample.com", "/\n/evil", "/bad%ZZ"])("rejects an unsafe target %s", (target) => {
    expect(postLoginPath({ role: "ADMIN", status: "ACTIVE" }, target)).toBe("/admin");
    expect(postLoginPath({ role: "USER", status: "ACTIVE" }, target)).toBe("/");
  });

  it("normalizes local return paths without removing query/hash", () => {
    expect(safeReturnTo("/orders/../support", "?type=ACCOUNT#reply")).toBe("/support?type=ACCOUNT#reply");
    expect(safeReturnTo("/products/..//example.com", "")).toBe("/");
  });

  it.each(["USER", "ADMIN"] as const)("keeps locked %s accounts in restricted routes", (role) => {
    expect(postLoginPath({ role, status: "LOCKED" })).toBe("/orders");
    expect(postLoginPath({ role, status: "LOCKED" }, "/admin")).toBe("/orders");
    expect(postLoginPath({ role, status: "LOCKED" }, "/checkout")).toBe("/orders");
    expect(postLoginPath({ role, status: "LOCKED" }, "/support/new")).toBe("/support/new");
  });
});

describe("role guards", () => {
  function setSession(user: SessionUser | null, status: "ready" | "loading" = "ready") {
    mockedUseSession.mockReturnValue({ viewer: user, status, refresh: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(), expire: vi.fn() });
  }

  beforeEach(() => mockedUseSession.mockReset());

  it.each([
    [{ ...viewer, role: "ADMIN" as const }, "/login", "/admin"],
    [{ ...viewer, role: "ADMIN" as const }, "/login?returnTo=%2F", "/admin"],
    [viewer, "/login?returnTo=%2Fadmin", "/"],
    [viewer, "/login?returnTo=%2Fcheckout", "/checkout"],
    [{ ...viewer, status: "LOCKED" as const }, "/login", "/orders"],
  ])("redirects existing sessions with the same login policy", async (user, path, expected) => {
    setSession(user);
    render(<MemoryRouter initialEntries={[path]}><Routes>
      <Route path="/login" element={<GuestOnly><div>Login form</div></GuestOnly>} />
      <Route path="*" element={<LocationProbe />} />
    </Routes></MemoryRouter>);
    expect((await screen.findByTestId("location")).textContent).toBe(expected);
    expect(screen.queryByText("Login form")).not.toBeInTheDocument();
  });

  it.each([
    [viewer, "/403"],
    [{ ...viewer, role: "ADMIN" as const, status: "LOCKED" as const }, "/orders"],
    [null, "/login?returnTo=%2Fadmin%2Fusers"],
  ])("does not render admin content for unauthorized sessions", async (user, expected) => {
    setSession(user);
    render(<MemoryRouter initialEntries={["/admin/users"]}><Routes>
      <Route path="/admin/users" element={<RequireAdmin><div>Private admin content</div></RequireAdmin>} />
      <Route path="*" element={<LocationProbe />} />
    </Routes></MemoryRouter>);
    expect((await screen.findByTestId("location")).textContent).toBe(expected);
    expect(screen.queryByText("Private admin content")).not.toBeInTheDocument();
  });

  it("renders the admin route for an active admin", () => {
    setSession({ ...viewer, role: "ADMIN" });
    render(<MemoryRouter><RequireAdmin><div>Private admin content</div></RequireAdmin></MemoryRouter>);
    expect(screen.getByText("Private admin content")).toBeInTheDocument();
  });

  it("waits for session bootstrap before granting admin access", () => {
    setSession({ ...viewer, role: "ADMIN" }, "loading");
    render(<MemoryRouter><RequireAdmin><div>Private admin content</div></RequireAdmin></MemoryRouter>);
    expect(screen.queryByText("Private admin content")).not.toBeInTheDocument();
  });
});
