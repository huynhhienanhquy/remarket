import type { AdminProductItem, AdminUserItem } from "@remarket/shared";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/common";
import { createQueryClient } from "../../config/queryClient";
import { failure, httpContext } from "../../tests/http-context";
import { member, product, timestamp } from "../../tests/test-data";
import { AdminProductsPage } from "../AdminProductsPage/AdminProductsPage";
import { AdminUsersPage } from "./AdminUsersPage";

const alice: AdminUserItem = {
  ...member, id: "alice", full_name: "Người bán An", email: "an@example.test",
  province_label: "Hà Nội", created_at: timestamp, lock_reason: null, locked_at: null,
};
const bob: AdminUserItem = { ...alice, id: "bob", full_name: "Người bán Bình", email: "binh@example.test" };
const products: AdminProductItem[] = (["ACTIVE", "SOLD", "PENDING"] as const).map((status) => ({
  ...product, id: `alice-${status}`, title: `Sản phẩm An ${status}`, status,
  seller: { ...product.seller, id: alice.id, name: alice.full_name },
  category_name: "Điện tử", updated_at: timestamp,
}));
const bobProduct: AdminProductItem = { ...products[0]!, id: "bob-product", title: "Sản phẩm riêng của Bình", seller: { ...product.seller, id: bob.id, name: bob.full_name } };
let context: ReturnType<typeof httpContext>;
let client: ReturnType<typeof createQueryClient>;

function show(path = "/admin/users?page=3") {
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><ToastProvider><Routes>
    <Route path="/admin/users" element={<AdminUsersPage />} />
    <Route path="/admin/products" element={<AdminProductsPage />} />
    <Route path="/messages/:id" element={<h1>Đã mở chat hệ thống</h1>} />
  </Routes></ToastProvider></MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  context = httpContext();
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  context.reply("GET", "/admin/users", { items: [alice, bob], meta: { page: 3, page_size: 20, total: 42, total_pages: 3 } });
  context.reply("GET", "/admin/users/alice", alice);
  context.reply("GET", "/admin/users/bob", bob);
  context.reply("GET", "/admin/categories/tree", []);
  context.on("GET", "/admin/products", ({ url }) => {
    const seller = url.searchParams.get("seller_id");
    const status = url.searchParams.get("status");
    const page = Number(url.searchParams.get("page") ?? 1);
    const rows = [...products, bobProduct].filter((item) => item.seller.id === seller && (!status || item.status === status));
    return { items: rows.slice((page - 1) * 2, page * 2), meta: { page, page_size: 2, total: rows.length, total_pages: Math.max(1, Math.ceil(rows.length / 2)) } };
  });
});
afterEach(() => { client.clear(); vi.unstubAllGlobals(); });

describe("admin views each user's products", () => {
  it("opens the selected user's official conversation from their profile", async () => {
    context.reply("POST", "/admin/users/alice/conversation", { conversation_id: "official-chat" });
    const user = userEvent.setup();
    show("/admin/users?selected=alice");
    await user.click(await screen.findByRole("button", { name: "Nhắn tin hệ thống" }));
    expect(await screen.findByRole("heading", { name: "Đã mở chat hệ thống" })).toBeInTheDocument();
    expect(context.requests("POST", "/admin/users/alice/conversation")).toHaveLength(1);
    expect(context.requests("POST", "/admin/users/alice/conversation")[0]?.body).toEqual({});
  });
  it("explains why locked users cannot receive new messages", async () => {
    context.reply("GET", "/admin/users/alice", { ...alice, status: "LOCKED" });
    show("/admin/users?selected=alice");
    expect(await screen.findByRole("button", { name: "Nhắn tin hệ thống" })).toBeDisabled();
    expect(screen.getByText("Tài khoản đang bị khóa nên chưa thể nhận tin nhắn mới.")).toBeInTheDocument();
    expect(context.requests("POST", "/admin/users/alice/conversation")).toHaveLength(0);
  });
  it("loads on user click, pages through every product and opens pending product details in admin", async () => {
    const user = userEvent.setup();
    show();
    const identity = await screen.findByText(alice.full_name);
    expect(context.requests("GET", "/admin/products")).toHaveLength(0);
    await user.click(identity);
    const region = await screen.findByRole("region", { name: "Sản phẩm của người dùng" });
    expect(await within(region).findByText("Sản phẩm An ACTIVE")).toBeInTheDocument();
    expect(within(region).getByText("Sản phẩm An SOLD")).toBeInTheDocument();
    expect(within(region).queryByText(bobProduct.title)).not.toBeInTheDocument();
    await user.click(within(region).getByRole("button", { name: "Sau" }));
    const pending = await within(region).findByRole("link", { name: /Sản phẩm An PENDING/ });
    const target = new URL(pending.getAttribute("href")!, "http://test");
    expect(Object.fromEntries(target.searchParams)).toEqual({ seller_id: alice.id, status: "ALL", page: "2", selected: "alice-PENDING" });
    await user.click(pending);
    const detail = await screen.findByRole("dialog", { name: "Xem xét tin đăng" });
    expect(within(detail).getByRole("heading", { name: "Sản phẩm An PENDING" })).toBeInTheDocument();
    expect(within(detail).getByText(product.description)).toBeInTheDocument();
    expect(within(detail).getByRole("button", { name: "Duyệt tin" })).toBeInTheDocument();
  });

  it("filters selling, sold and pending products without changing the user-list page or mixing users", async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByText(alice.full_name));
    let region = await screen.findByRole("region", { name: "Sản phẩm của người dùng" });
    await within(region).findByText("Sản phẩm An ACTIVE");
    await user.click(within(region).getByRole("button", { name: "Sau" }));
    await within(region).findByText("Sản phẩm An PENDING");
    for (const [label, status] of [["Đang bán", "ACTIVE"], ["Đã bán", "SOLD"], ["Chờ duyệt", "PENDING"]]) {
      await user.click(within(region).getByRole("tab", { name: label }));
      await within(region).findByText(`Sản phẩm An ${status}`);
      expect(within(region).getAllByRole("link")).toHaveLength(1);
      const last = context.requests("GET", "/admin/products").at(-1)!;
      expect(last.url.searchParams.get("seller_id")).toBe(alice.id);
      expect(last.url.searchParams.get("status")).toBe(status);
      expect(last.url.searchParams.get("page")).toBe("1");
    }
    expect(context.requests("GET", "/admin/users").every(({ url }) => url.searchParams.get("page") === "3")).toBe(true);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Đóng" }));
    await user.click(screen.getByText(bob.full_name));
    region = await screen.findByRole("region", { name: "Sản phẩm của người dùng" });
    expect(await within(region).findByText(bobProduct.title)).toBeInTheDocument();
    expect(within(region).getByRole("tab", { name: "Tất cả" })).toHaveAttribute("aria-selected", "true");
    expect(within(region).queryByText(/Sản phẩm An/)).not.toBeInTheDocument();
    const last = context.requests("GET", "/admin/products").at(-1)!;
    expect(last.url.searchParams.get("seller_id")).toBe(bob.id);
    expect(last.url.searchParams.get("page")).toBe("1");
    expect(last.url.searchParams.has("status")).toBe(false);
  });

  it("shows product errors with retry and an honest empty state after recovery", async () => {
    context.reply("GET", "/admin/products", failure(500, "INTERNAL_ERROR"));
    const user = userEvent.setup();
    show("/admin/users?selected=alice");
    const region = await screen.findByRole("region", { name: "Sản phẩm của người dùng" });
    await within(region).findByRole("alert");
    expect(within(region).queryByText("Người dùng chưa có sản phẩm")).not.toBeInTheDocument();
    context.reply("GET", "/admin/products", { items: [], meta: { page: 1, page_size: 20, total: 0, total_pages: 1 } });
    await user.click(within(region).getByRole("button", { name: "Tải lại" }));
    expect(await within(region).findByText("Người dùng chưa có sản phẩm")).toBeInTheDocument();
    await user.click(within(region).getByRole("tab", { name: "Đã bán" }));
    expect(await within(region).findByText("Không có sản phẩm ở trạng thái này")).toBeInTheDocument();
  });
});
