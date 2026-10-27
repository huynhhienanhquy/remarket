import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../queryClient";
import { SessionProvider } from "../../../contexts/SessionContext";
import { ToastProvider } from "../../../components/common";
import { MarketplaceShell } from "../../../layouts/MarketplaceShell/MarketplaceShell";
import { AccountShell } from "../../../layouts/AccountShell/AccountShell";
import { AdminShell } from "../../../layouts/AdminShell/AdminShell";
import { HomePage } from "../../../pages/HomePage/HomePage";
import { CartPage } from "../../../pages/CartPage/CartPage";
import { MessagesPage } from "../../../pages/MessagesPage/MessagesPage";
import { NotificationsPage } from "../../../pages/NotificationsPage/NotificationsPage";
import { AdminUsersPage } from "../../../pages/AdminUsersPage/AdminUsersPage";
import { AdminEmailVerificationsPage } from "../../../pages/AdminEmailVerificationsPage/AdminEmailVerificationsPage";
import { SearchPage } from "../../../pages/SearchPage/SearchPage";
import { VerifyEmailPage } from "../../../pages/VerifyEmailPage/VerifyEmailPage";
import { RequireAdmin, RequireAuth } from "../guards";
import { httpContext, page } from "../../../tests/http-context";
import { member, product, seller, timestamp } from "../../../tests/test-data";

let context: ReturnType<typeof httpContext>;
let client: ReturnType<typeof createQueryClient>;
beforeEach(() => {
  context = httpContext(member);
  context.reply("GET", "/products", page([product]));
  context.reply("GET", "/cart", { groups: [], total_items: 0 });
  context.reply("GET", "/conversations", page([]));
  context.reply("GET", "/notifications", { ...page([]), meta: { ...page([]).meta, unread: 0 } });
  context.reply("GET", "/admin/users", page([]));
  context.reply("GET", "/conversations/thread", {
    id: "thread", can_send: true, unavailable_reason: null,
    counterparty: { id: seller.id, name: seller.name, avatar_url: null },
    product: { id: product.id, title: product.title, image_url: null, price: product.price, status: "ACTIVE" },
    last_message: null, unread_count: 0, updated_at: timestamp,
  });
  context.reply("GET", "/conversations/thread/messages", { items: [], next_cursor: null });
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30_000 } });
});
afterEach(() => {
  cleanup(); client.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function show(path: string) {
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><SessionProvider><ToastProvider>
    <Link to="/cart">Test cart</Link><Link to="/messages">Test messages</Link><Link to="/admin/users">Test admin users</Link>
    <Routes>
      <Route element={<MarketplaceShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/products" element={<SearchPage />} />
      </Route>
      <Route element={<RequireAuth><AccountShell /></RequireAuth>}>
        <Route path="/cart" element={<CartPage />} />
        <Route path="/messages/:id?" element={<MessagesPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
      </Route>
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route element={<RequireAdmin><AdminShell /></RequireAdmin>}>
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/email-verifications" element={<AdminEmailVerificationsPage />} />
      </Route>
    </Routes>
  </ToastProvider></SessionProvider></MemoryRouter></QueryClientProvider>);
}
function reads() { return context.calls.filter((request) => request.method === "GET").map((request) => request.path); }
async function settled(endpoint: string) {
  await waitFor(() => expect(context.requests("GET", endpoint)).toHaveLength(1));
  await waitFor(() => expect(client.isFetching()).toBe(0));
}

describe("only the current page loads its data", () => {
  it.each([
    ["/cart", "/cart"], ["/messages", "/conversations"], ["/notifications", "/notifications"],
  ])("opening %s loads its own data and the shared header counts", async (path, endpoint) => {
    show(path!);
    await settled(endpoint!);
    expect(reads().sort()).toEqual([endpoint, "/notifications/navigation-counts"].sort());
    expect(context.requests("POST", "/auth/bootstrap")).toHaveLength(1);
  });

  it("loads compact admin counts without fetching the individual queues", async () => {
    context.viewer = { ...member, role: "ADMIN" };
    show("/admin/users");
    await settled("/admin/users");
    expect(reads().sort()).toEqual(["/admin/users", "/admin/navigation-counts"].sort());
  });

  it("aborts the old page request on navigation and keeps subsequent page loads isolated", async () => {
    context.on("GET", "/products", () => new Promise(() => {}));
    show("/");
    await waitFor(() => expect(context.requests("GET", "/products")).toHaveLength(1));
    const oldRequest = context.requests("GET", "/products")[0]!;
    expect(oldRequest.signal?.aborted).toBe(false);
    fireEvent.click(screen.getByText("Test cart"));
    await settled("/cart");
    expect(oldRequest.signal?.aborted).toBe(true);
    const count = context.calls.length;
    fireEvent.click(screen.getByText("Test messages"));
    await settled("/conversations");
    expect(context.calls.slice(count).map((request) => request.path)).toEqual(["/conversations"]);
    expect(context.requests("GET", "/cart")).toHaveLength(1);
    expect(context.requests("GET", "/notifications/navigation-counts")).toHaveLength(1);
  });

  it("does not keep an admin page request alive through its menu badge", async () => {
    context.viewer = { ...member, role: "ADMIN" };
    context.on("GET", "/admin/email-verifications", () => new Promise(() => {}));
    show("/admin/email-verifications");
    await waitFor(() => expect(context.requests("GET", "/admin/email-verifications")).toHaveLength(1));
    const pending = context.requests("GET", "/admin/email-verifications")[0]!;
    expect(pending.signal?.aborted).toBe(false);
    fireEvent.click(screen.getByText("Test admin users"));
    await settled("/admin/users");
    expect(pending.signal?.aborted).toBe(true);
  });

  it("keeps an idle cart page free of badge and identity polling", async () => {
    context.viewer = { ...member, email_verified_at: null };
    show("/cart");
    await settled("/cart");
    const count = context.calls.length;
    vi.useFakeTimers();
    await act(async () => { await vi.advanceTimersByTimeAsync(90_000); });
    expect(context.calls).toHaveLength(count);
  });

  it.each([false, true])("loads the conversation sidebar only when visible (desktop: %s)", async (desktop) => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: desktop, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn(),
    }) as unknown as MediaQueryList);
    show("/messages/thread");
    await settled("/conversations/thread/messages");
    expect(context.requests("GET", "/conversations")).toHaveLength(desktop ? 1 : 0);
    expect(reads()).not.toContain("/products");
    expect(reads()).not.toContain("/cart");
  });

  it("loads mobile filter options when the filter panel opens", async () => {
    show("/products");
    await settled("/products");
    expect(context.requests("GET", "/provinces")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /^Bộ lọc/ }));
    await settled("/provinces");
    expect(context.requests("GET", "/products")).toHaveLength(1);
  });

  it("refreshes approval capabilities on the verification page", async () => {
    context.viewer = { ...member, email_verified_at: null };
    context.reply("GET", "/auth/email-verification-request", {
      id: member.id, user: { id: member.id, email: member.email, full_name: member.full_name, status: "ACTIVE" },
      status: "APPROVED", requested_at: timestamp, approved_at: timestamp,
    });
    context.reply("GET", "/auth/me", member);
    show("/verify-email");
    await screen.findByText("Email đã được xác minh");
    expect(context.requests("GET", "/auth/me")).toHaveLength(1);
    expect(reads()).not.toContain("/products");
  });
});
