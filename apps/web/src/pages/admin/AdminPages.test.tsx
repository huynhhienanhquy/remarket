import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/ui";
import { createQueryClient } from "../../lib/queryClient";
import { db, resetDb, setCurrentUserId } from "../../mocks/store";
import { adminApi } from "../../mocks/adapter-admin";
import { IDS } from "../../mocks/time";
import { AdminAuditPage } from "./AdminAuditPage";
import { AdminCategoriesPage } from "./AdminCategoriesPage";
import { AdminDashboardPage } from "./AdminDashboardPage";
import { AdminProductsPage } from "./AdminProductsPage";
import { AdminReportsPage } from "./AdminReportsPage";
import { AdminReviewsPage } from "./AdminReviewsPage";
import { AdminSupportPage } from "./AdminSupportPage";
import { AdminUsersPage } from "./AdminUsersPage";

// These are fixture-driven UI tests, independent of the developer's live .env.
vi.mock("../../lib/api", async () => {
  const { createMockAdapter } = await import("../../mocks/adapter");
  return { api: createMockAdapter() };
});

async function renderAdmin(Page: ComponentType, path: string) {
  const queryClient = createQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          <Page />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("admin routes", () => {
  beforeEach(() => {
    resetDb();
    setCurrentUserId(IDS.user(1));
  });

  it.each([
    ["Tổng quan", AdminDashboardPage, "/admin"],
    ["Người dùng", AdminUsersPage, "/admin/users"],
    ["Sản phẩm và kiểm duyệt", AdminProductsPage, "/admin/products"],
    ["Danh mục", AdminCategoriesPage, "/admin/categories"],
    ["Báo cáo", AdminReportsPage, "/admin/reports"],
    ["Đánh giá", AdminReviewsPage, "/admin/reviews"],
    ["Hỗ trợ", AdminSupportPage, "/admin/support"],
    ["Nhật ký thao tác", AdminAuditPage, "/admin/audit"],
  ])("renders %s with mock data", async (heading, Page, path) => {
    await renderAdmin(Page, path);
    expect(await screen.findByRole("heading", { name: heading, level: 1 })).toBeInTheDocument();
  });

  it("shows every product status, unresolved tickets and transaction value wording", async () => {
    await renderAdmin(AdminDashboardPage, "/admin?from=2026-10-01&to=2026-10-07");
    expect(await screen.findByText("Sản phẩm theo trạng thái")).toBeInTheDocument();
    expect(screen.getByText("Yêu cầu hỗ trợ chưa giải quyết")).toBeInTheDocument();
    expect(screen.getByText("Giá trị giao dịch hoàn tất trong kỳ")).toBeInTheDocument();
    expect(screen.queryByText(/^Doanh thu/)).not.toBeInTheDocument();
    for (const status of ["PENDING", "ACTIVE", "REJECTED", "RESERVED", "SOLD", "INACTIVE", "BLOCKED"]) {
      expect(document.querySelector('a[href="/admin/products?status=' + status + '"]')).toBeInTheDocument();
    }
  });

  it("reactivates an inactive category and refreshes the filtered list", async () => {
    const category = await adminApi.createCategory({ name: "Danh mục kiểm thử", slug: "danh-muc-kiem-thu", parent_id: null });
    await adminApi.updateCategory(category.id, { status: "INACTIVE" });
    const user = userEvent.setup();
    await renderAdmin(AdminCategoriesPage, "/admin/categories?status=INACTIVE");
    await user.click(await screen.findByRole("button", { name: /Danh mục kiểm thử/ }));
    await user.click(await screen.findByRole("button", { name: "Kích hoạt" }));
    await waitFor(() => expect(db().categories.find((c) => c.id === category.id)?.status).toBe("ACTIVE"));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Danh mục kiểm thử/ })).not.toBeInTheDocument());
    expect(await screen.findByRole("button", { name: "Vô hiệu" })).toBeInTheDocument();
  });
});
