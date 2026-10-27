import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../config/queryClient";
import { failure, httpContext, page } from "../../tests/http-context";
import { member } from "../../tests/test-data";
import { ADMIN_NAVIGATION } from "../../config/route/adminNavigation";
import { AppRouter } from "../../config/route/router";
import { SessionProvider } from "../../contexts/SessionContext";
import { RowAction } from "../../components/admin/RowAction/RowAction";
import { invalidateAdminResources } from "../../helpers/adminCache";

let context: ReturnType<typeof httpContext>;
const clients: ReturnType<typeof createQueryClient>[] = [];
function show(path: string) {
  window.history.replaceState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  const client = createQueryClient(); clients.push(client);
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  render(<QueryClientProvider client={client}><SessionProvider><AppRouter /></SessionProvider></QueryClientProvider>);
  return client;
}
beforeEach(() => {
  context = httpContext({ ...member, role: "ADMIN" });
  context.reply("GET", "/admin/dashboard", { total_users: 0, new_users_in_period: 0, pending_products: 0, completed_orders_in_period: 0, completed_order_value_in_period: "0", pending_reports: 0, unresolved_tickets: 0, blocked_products: 0, products_by_status: { PENDING: 0, ACTIVE: 0, REJECTED: 0, RESERVED: 0, SOLD: 0, INACTIVE: 0 }, pending_products_queue: [], open_tickets_queue: [] });
  context.reply("GET", "/admin/categories/tree", []);
  for (const endpoint of ["users", "email-verifications", "products", "categories", "reports", "reviews", "support-tickets", "audit-logs"]) context.reply("GET", "/admin/" + endpoint, page([]));
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("admin navigation and filters", () => {
  it("shows global queue badges on desktop and mobile with one shared request", async () => {
    context.reply("GET", "/admin/navigation-counts", { pending_products: 105, pending_email_verifications: 1, pending_reports: 104, open_tickets: 3 });
    show("/admin/users?page=3&status=LOCKED");
    const nav = await screen.findByRole("navigation", { name: "Khu vực quản trị" });
    expect(await within(nav).findByLabelText("104 báo cáo chờ xử lý")).toHaveTextContent("99+");
    expect(within(nav).getByLabelText("105 sản phẩm chờ duyệt")).toHaveTextContent("99+");
    expect(within(nav).getByLabelText("1 yêu cầu chờ duyệt")).toHaveTextContent("1");
    expect(within(nav).getByLabelText("3 yêu cầu hỗ trợ đang mở")).toHaveTextContent("3");
    await userEvent.click(screen.getByRole("button", { name: "Mở menu quản trị" }));
    const menu = within(screen.getByRole("dialog", { name: "Menu quản trị" }));
    expect(menu.getByLabelText("105 sản phẩm chờ duyệt")).toHaveTextContent("99+");
    expect(menu.getByLabelText("104 báo cáo chờ xử lý")).toHaveTextContent("99+");
    expect(menu.getByLabelText("3 yêu cầu hỗ trợ đang mở")).toHaveTextContent("3");
    expect(context.requests("GET", "/admin/navigation-counts")).toHaveLength(1);
    for (const queue of ["products", "email-verifications", "reports", "support-tickets"]) expect(context.requests("GET", `/admin/${queue}`)).toHaveLength(0);
  });
  it("discovers new pending products, reports and support requests while staying on another admin page", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const client = show("/admin/users");
    await screen.findByRole("heading", { name: "Người dùng", level: 1 });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    expect(screen.queryByLabelText(/sản phẩm chờ duyệt|báo cáo chờ xử lý|yêu cầu hỗ trợ đang mở/)).not.toBeInTheDocument();
    context.reply("GET", "/admin/navigation-counts", { pending_products: 2, pending_email_verifications: 0, pending_reports: 2, open_tickets: 1 });
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    vi.useRealTimers();
    expect(await screen.findByLabelText("2 báo cáo chờ xử lý")).toBeInTheDocument();
    expect(await screen.findByLabelText("2 sản phẩm chờ duyệt")).toBeInTheDocument();
    expect(await screen.findByLabelText("1 yêu cầu hỗ trợ đang mở")).toBeInTheDocument();
    expect(context.requests("GET", "/admin/users")).toHaveLength(1);
  });
  it.each(["products", "reports", "tickets"] as const)("refreshes badges after %s are handled and hides zero counts", async (resource) => {
    context.reply("GET", "/admin/navigation-counts", { pending_products: 1, pending_email_verifications: 0, pending_reports: 1, open_tickets: 1 });
    const client = show("/admin/users");
    await screen.findByLabelText("1 báo cáo chờ xử lý");
    expect(screen.getByLabelText("1 sản phẩm chờ duyệt")).toBeInTheDocument();
    context.reply("GET", "/admin/navigation-counts", { pending_products: 0, pending_email_verifications: 0, pending_reports: 0, open_tickets: 0 });
    await act(async () => { await invalidateAdminResources(client, resource); });
    await waitFor(() => expect(screen.queryByLabelText(/sản phẩm chờ duyệt|báo cáo chờ xử lý|yêu cầu hỗ trợ đang mở/)).not.toBeInTheDocument());
    expect(context.requests("GET", "/admin/navigation-counts")).toHaveLength(2);
  });
  it("hides badges after a failed refresh without blocking the admin page", async () => {
    context.reply("GET", "/admin/navigation-counts", { pending_products: 1, pending_email_verifications: 1, pending_reports: 1, open_tickets: 1 });
    const client = show("/admin/users");
    await screen.findByLabelText("1 báo cáo chờ xử lý");
    context.on("GET", "/admin/navigation-counts", () => failure(503, "RETRY_LATER"));
    await act(async () => { await invalidateAdminResources(client, "reports"); });
    await waitFor(() => expect(screen.queryByLabelText(/sản phẩm chờ duyệt|yêu cầu chờ duyệt|báo cáo chờ xử lý|yêu cầu hỗ trợ đang mở/)).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Người dùng", level: 1 })).toBeInTheDocument();
  });
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
