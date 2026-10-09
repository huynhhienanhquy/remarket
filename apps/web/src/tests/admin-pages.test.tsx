import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminDashboard, CategoryNode } from "@remarket/shared";
import { ToastProvider } from "../components/common";
import { createQueryClient } from "../config/queryClient";
import { httpContext, page } from "./http-context";
import { AdminAuditPage } from "../pages/AdminAuditPage/AdminAuditPage";
import { AdminCategoriesPage } from "../pages/AdminCategoriesPage/AdminCategoriesPage";
import { AdminDashboardPage } from "../pages/AdminDashboardPage/AdminDashboardPage";
import { AdminProductsPage } from "../pages/AdminProductsPage/AdminProductsPage";
import { AdminReportsPage } from "../pages/AdminReportsPage/AdminReportsPage";
import { AdminReviewsPage } from "../pages/AdminReviewsPage/AdminReviewsPage";
import { AdminSupportPage } from "../pages/AdminSupportPage/AdminSupportPage";
import { AdminUsersPage } from "../pages/AdminUsersPage/AdminUsersPage";

const dashboard: AdminDashboard = {
  total_users: 0, new_users_in_period: 0, pending_products: 0,
  completed_orders_in_period: 0, completed_order_value_in_period: "0",
  pending_reports: 0, unresolved_tickets: 0, blocked_products: 0,
  products_by_status: { PENDING: 0, ACTIVE: 0, REJECTED: 0, RESERVED: 0, SOLD: 0, INACTIVE: 0 },
  pending_products_queue: [], open_tickets_queue: [],
};
let context: ReturnType<typeof httpContext>;
const clients: ReturnType<typeof createQueryClient>[] = [];
function renderAdmin(Page: ComponentType, path: string) {
  const queryClient = createQueryClient();
  clients.push(queryClient);
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[path]}><ToastProvider><Page /></ToastProvider></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
  context = httpContext();
  context.reply("GET", "/admin/dashboard", dashboard);
  context.reply("GET", "/admin/categories/tree", []);
  for (const path of ["users", "products", "categories", "reports", "reviews", "support-tickets", "audit-logs"]) context.reply("GET", "/admin/" + path, page([]));
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.unstubAllGlobals(); });
describe("admin routes through the HTTP adapter", () => {
  it.each([
    ["Tổng quan", AdminDashboardPage, "/admin", "/admin/dashboard"],
    ["Người dùng", AdminUsersPage, "/admin/users", "/admin/users"],
    ["Sản phẩm và kiểm duyệt", AdminProductsPage, "/admin/products", "/admin/products"],
    ["Danh mục", AdminCategoriesPage, "/admin/categories", "/admin/categories"],
    ["Báo cáo", AdminReportsPage, "/admin/reports", "/admin/reports"],
    ["Đánh giá", AdminReviewsPage, "/admin/reviews", "/admin/reviews"],
    ["Hỗ trợ", AdminSupportPage, "/admin/support", "/admin/support-tickets"],
    ["Nhật ký thao tác", AdminAuditPage, "/admin/audit", "/admin/audit-logs"],
  ])("loads %s from its API endpoint", async (heading, Page, path, endpoint) => {
    renderAdmin(Page, path);
    expect(await screen.findByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
    await waitFor(() => expect(context.requests("GET", endpoint)).toHaveLength(1));
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).not.toBeInTheDocument());
  });
  it("shows all statuses and transaction value wording from dashboard data", async () => {
    renderAdmin(AdminDashboardPage, "/admin?from=2026-10-01&to=2026-10-07");
    expect(await screen.findByText("Sản phẩm theo trạng thái")).toBeInTheDocument();
    expect(screen.getByText("Yêu cầu hỗ trợ chưa giải quyết")).toBeInTheDocument();
    expect(screen.getByText("Giá trị giao dịch hoàn tất trong kỳ")).toBeInTheDocument();
    expect(screen.queryByText(/^Doanh thu/)).not.toBeInTheDocument();
    for (const status of ["PENDING", "ACTIVE", "REJECTED", "RESERVED", "SOLD", "INACTIVE", "BLOCKED"]) {
      expect(document.querySelector('a[href="/admin/products?status=' + status + '"]')).toBeInTheDocument();
    }
    expect(context.requests("GET", "/admin/dashboard")[0]?.url.searchParams.get("from")).toBe("2026-10-01");
  });
  it("reactivates an inactive category then refetches the tree and filtered list", async () => {
    let category: CategoryNode = { id: "category-test", name: "Danh mục kiểm thử", slug: "danh-muc-kiem-thu", parent_id: null, status: "INACTIVE", children: [] };
    context.on("GET", "/admin/categories/tree", () => [category]);
    context.on("GET", "/admin/categories", () => page(category.status === "INACTIVE" ? [category] : []));
    context.on("PATCH", "/admin/categories/" + category.id, () => { category = { ...category, status: "ACTIVE" }; return category; });
    const user = userEvent.setup();
    renderAdmin(AdminCategoriesPage, "/admin/categories?status=INACTIVE");
    await user.click(await screen.findByRole("button", { name: /Danh mục kiểm thử/ }));
    await user.click(await screen.findByRole("button", { name: "Kích hoạt" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Danh mục kiểm thử/ })).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "Vô hiệu" })).toBeInTheDocument();
    expect(context.requests("PATCH", "/admin/categories/category-test")[0]?.body).toEqual({ status: "ACTIVE" });
    expect(context.requests("GET", "/admin/categories").length).toBeGreaterThan(1);
  });
});
