import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../lib/queryClient";
import { httpContext, page } from "../tests/http-context";
import { member } from "../tests/test-data";
import { ADMIN_NAVIGATION } from "../components/features/AdminNavigation";
import { AppRouter } from "./router";
import { SessionProvider } from "./SessionProvider";
import { RowAction } from "../pages/admin/adminShared";

let context: ReturnType<typeof httpContext>;
const clients: ReturnType<typeof createQueryClient>[] = [];
function show(path: string) {
  window.history.replaceState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  const client = createQueryClient(); clients.push(client);
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  render(<QueryClientProvider client={client}><SessionProvider><AppRouter /></SessionProvider></QueryClientProvider>);
}
beforeEach(() => {
  context = httpContext({ ...member, role: "ADMIN" });
  context.reply("GET", "/admin/dashboard", { total_users: 0, new_users_in_period: 0, pending_products: 0, completed_orders_in_period: 0, completed_order_value_in_period: "0", pending_reports: 0, unresolved_tickets: 0, blocked_products: 0, products_by_status: { PENDING: 0, ACTIVE: 0, REJECTED: 0, RESERVED: 0, SOLD: 0, INACTIVE: 0 }, pending_products_queue: [], open_tickets_queue: [] });
  context.reply("GET", "/admin/categories/tree", []);
  for (const endpoint of ["users", "email-verifications", "products", "categories", "reports", "reviews", "support-tickets", "audit-logs"]) context.reply("GET", "/admin/" + endpoint, page([]));
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.unstubAllGlobals(); });

describe("admin navigation and filters", () => {
  it("activates a row action once without triggering the parent row by keyboard", async () => {
    const parent = vi.fn();
    const action = vi.fn();
    render(<div onKeyDown={parent} onClick={parent}><RowAction onClick={action}>Xem chi tiết</RowAction></div>);
    screen.getByRole("button", { name: "Xem chi tiết" }).focus();
    await userEvent.setup().keyboard("{Enter}");
    expect(action).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });
  it.each(ADMIN_NAVIGATION)("marks only $label active at $to", async ({ to, label }) => {
    show(to);
    const nav = await screen.findByRole("navigation", { name: "Khu vực quản trị" });
    expect(within(nav).getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    for (const item of ADMIN_NAVIGATION) expect(within(nav).getByRole("link", { name: item.label })).toHaveAttribute("href", item.to);
    await waitFor(() => expect(document.querySelector("main h1")).not.toBeNull());
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    await waitFor(() => expect(document.querySelector('main [aria-busy="true"]')).toBeNull());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
  it("closes the mobile menu on navigation and restores focus on Escape", async () => {
    show("/admin/users");
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Mở menu quản trị" });
    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Menu quản trị" });
    expect(document.body.style.overflow).toBe("hidden");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).not.toBe("hidden");
    await user.click(trigger);
    await user.click(within(screen.getByRole("dialog")).getByRole("link", { name: "Sản phẩm" }));
    await screen.findByRole("heading", { name: "Sản phẩm và kiểm duyệt", level: 1 });
    expect(window.location.pathname).toBe("/admin/products");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("restores advanced filters and clears only their fields", async () => {
    show("/admin/users?status=LOCKED&from=2026-10-01&handled_by=admin-test&page=3");
    const reset = await screen.findByRole("button", { name: "Xóa bộ lọc nâng cao" });
    expect(document.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByLabelText("Từ ngày")).toHaveValue("2026-10-01");
    await userEvent.setup().click(reset);
    await waitFor(() => expect(new URLSearchParams(window.location.search).has("from")).toBe(false));
    const params = new URLSearchParams(window.location.search);
    expect(params.get("status")).toBe("LOCKED");
    expect(params.has("handled_by")).toBe(false);
    expect(params.has("page")).toBe(false);
    await waitFor(() => expect(context.requests("GET", "/admin/users").at(-1)?.url.searchParams.get("status")).toBe("LOCKED"));
  });
});
