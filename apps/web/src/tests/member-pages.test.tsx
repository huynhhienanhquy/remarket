import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SessionProvider } from "../app/SessionProvider";
import { ToastProvider } from "../components/ui";
import { createQueryClient } from "../lib/queryClient";
import { createMockAdapter } from "../mocks/adapter";
import { db, resetDb, setCurrentUserId } from "../mocks/store";
import { IDS } from "../mocks/time";
import { AccountPage } from "../pages/account/AccountPage";
import { FavoritesPage } from "../pages/account/FavoritesPage";
import { NotificationsPage } from "../pages/account/NotificationsPage";
import { ConversationPage } from "../pages/chat/ConversationPage";
import { SupportNewPage } from "../pages/support/SupportNewPage";
import { SupportTicketPage } from "../pages/support/SupportTicketPage";
import { ProductFormPage } from "../pages/account/ProductFormPage";
import { CheckoutPage } from "../pages/checkout/CheckoutPage";
import { ProductDetailPage } from "../pages/discovery/ProductDetailPage";
import { ApiError } from "../lib/errors";

vi.mock("../lib/api", async () => {
  const { createMockAdapter } = await import("../mocks/adapter");
  return { api: createMockAdapter() };
});
const adapter = createMockAdapter();
function CheckoutTarget() { const location = useLocation(); return <h1>{`Checkout ${location.search}`}</h1>; }

function show(element: ReactNode, path = "/account", route = path.split("?")[0]!) {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><SessionProvider><ToastProvider><Routes>
    <Route path={route} element={element} />
    <Route path="/support/:id" element={<SupportTicketPage />} />
    <Route path="/sales/:id" element={<h1>Đơn bán đã mở</h1>} />
    <Route path="/orders/:id" element={<h1>Đơn mua đã tạo</h1>} />
    <Route path="/checkout" element={<CheckoutTarget />} />
    <Route path="/login" element={<h1>Đăng nhập để tiếp tục</h1>} />
  </Routes></ToastProvider></SessionProvider></MemoryRouter></QueryClientProvider>);
  return client;
}

beforeEach(() => { resetDb(); setCurrentUserId(IDS.user(4)); });

describe("member workflows", () => {
  it("buys only the viewed product, not every existing item in the cart", async () => {
    const product = db().products.find((entry) => entry.status === "ACTIVE" && entry.seller_id !== IDS.user(4) && !entry.is_blocked && entry.deleted_at === null)!;
    show(<ProductDetailPage />, `/products/${product.id}`, "/products/:id");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Mua ngay" })[0]).not.toBeDisabled());
    await userEvent.click(screen.getAllByRole("button", { name: "Mua ngay" })[0]!);
    expect(await screen.findByRole("heading", { name: `Checkout ?items=${product.id}` })).toBeInTheDocument();
  });
  it("asks a guest to log in before adding an item to the cart", async () => {
    setCurrentUserId(null);
    const product = db().products.find((entry) => entry.status === "ACTIVE" && !entry.is_blocked && entry.deleted_at === null)!;
    const { api } = await import("../lib/api"); const add = vi.spyOn(api.cart, "add");
    show(<ProductDetailPage />, `/products/${product.id}`, "/products/:id");
    await waitFor(() => expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).not.toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));
    expect(await screen.findByRole("heading", { name: "Đăng nhập để tiếp tục" })).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled(); add.mockRestore();
  });
  it("submits only canonical checkout fields, charges the server fee and preserves the key on network retry", async () => {
    const { api } = await import("../lib/api"); const spy = vi.spyOn(api.checkout, "create").mockRejectedValueOnce(new Error("Network unavailable"));
    db().cart_items = []; db().price_change_queue = [];
    const product = db().products.find((entry) => entry.status === "ACTIVE" && entry.seller_id !== IDS.user(4) && !entry.is_blocked && entry.deleted_at === null)!;
    product.delivery_method = "COD"; product.shipping_fee = "30000";
    await adapter.cart.add(product.id);
    show(<CheckoutPage />, `/checkout?items=${product.id}`, "/checkout");
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText("Phí giao hàng")).toHaveValue("30000"));
    const phone = screen.getByLabelText(/Số điện thoại/); await user.clear(phone); await user.type(phone, "0900000000");
    const address = screen.getByLabelText(/Địa chỉ giao nhận/); await user.clear(address); await user.type(address, "1 Đường kiểm thử, Hà Nội");
    await user.click(screen.getByRole("button", { name: "Đặt hàng" }));
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Đặt hàng" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Đặt hàng" }));
    expect(await screen.findByRole("heading", { name: "Đơn mua đã tạo" })).toBeInTheDocument();
    expect(spy.mock.calls[0]?.[1]).toBe(spy.mock.calls[1]?.[1]);
    const payload = spy.mock.calls[1]![0];
    expect(Object.keys(payload).sort()).toEqual(["deliveries", "items"]);
    expect(Object.keys(payload.items[0]!).sort()).toEqual(["expected_price", "product_id"]);
    expect(Object.keys(payload.deliveries[0]!).sort()).toEqual(["delivery_address", "expected_shipping_fee", "method", "recipient_name", "recipient_phone", "seller_id"]);
    spy.mockRestore();
  });
  it("saves profile changes and exposes the password recovery flow", async () => {
    const user = userEvent.setup(); show(<AccountPage />);
    const name = await screen.findByLabelText(/Họ tên/);
    await user.clear(name); await user.type(name, "Người mua kiểm thử");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(db().users.find((entry) => entry.id === IDS.user(4))?.full_name).toBe("Người mua kiểm thử"));
    expect(screen.getByRole("link", { name: "Đặt lại mật khẩu" })).toHaveAttribute("href", "/forgot-password");
  });

  it("removes a blocked saved item without showing its private title", async () => {
    const product = db().products.find((entry) => entry.status === "ACTIVE" && entry.seller_id !== IDS.user(4))!;
    await adapter.favorites.set(product.id, true); product.is_blocked = true;
    show(<FavoritesPage />, "/favorites");
    await screen.findByText("Tin đăng không còn khả dụng");
    expect(screen.queryByText(product.title)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lưu" }));
    await waitFor(() => expect(db().favorites.some((entry) => entry.product_id === product.id && entry.user_id === IDS.user(4))).toBe(false));
  });

  it("opens a seller notification using the actual order role", async () => {
    setCurrentUserId(IDS.user(2));
    const order = db().orders.find((entry) => entry.seller_id === IDS.user(2))!;
    db().notifications.unshift({ id: "test-notification", user_id: IDS.user(2), type: "ORDER_CREATED", title: "Thông báo đơn bán kiểm thử", content: "Nội dung an toàn", reference_type: "order", reference_id: order.id, read_at: null, created_at: new Date().toISOString() });
    show(<NotificationsPage />, "/notifications");
    await userEvent.click(await screen.findByRole("button", { name: /Thông báo đơn bán kiểm thử/ }));
    expect(await screen.findByRole("heading", { name: "Đơn bán đã mở" })).toBeInTheDocument();
    expect(db().notifications.find((entry) => entry.id === "test-notification")?.read_at).not.toBeNull();
  });

  it("lets a locked user create and reply to an account support request", async () => {
    setCurrentUserId(IDS.user(7)); const user = userEvent.setup(); show(<SupportNewPage />, "/support/new");
    await user.type(await screen.findByLabelText(/Tiêu đề/), "Cần hỗ trợ tài khoản");
    await user.type(screen.getByLabelText(/Nội dung/), "Tôi muốn được kiểm tra lại tài khoản bị khóa.");
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    const reply = await screen.findByLabelText(/Phản hồi/);
    await user.type(reply, "Thông tin bổ sung của tôi");
    await user.click(screen.getByRole("button", { name: "Gửi phản hồi" }));
    expect(await screen.findByText("Thông tin bổ sung của tôi")).toBeInTheDocument();
  });

  it("reopens a resolved support request only after a reply and clears the old conclusion", async () => {
    const ticket = db().tickets.find((entry) => entry.user_id === IDS.user(4))!;
    ticket.status = "RESOLVED"; ticket.resolution_note = "Kết luận cũ";
    const user = userEvent.setup(); show(<SupportTicketPage />, `/support/${ticket.id}`, "/support/:id");
    await user.type(await screen.findByLabelText(/Phản hồi/), "Vấn đề vẫn còn xảy ra");
    await user.click(screen.getByRole("button", { name: "Vẫn cần hỗ trợ" }));
    await waitFor(() => expect(ticket.status).toBe("OPEN"));
    expect(ticket.resolution_note).toBeNull();
  });

  it.each([
    { label: "network failure", failure: new Error("Network unavailable") },
    { label: "retryable database conflict", failure: new ApiError({ code: "RETRY_LATER", status: 409, message: "Vui lòng thử lại" }) },
  ])("sends persisted chat messages with the same client id when retrying a $label", async ({ failure }) => {
    const { api } = await import("../lib/api");
    const send = vi.spyOn(api.chat, "send");
    send.mockRejectedValueOnce(failure);
    const conversation = db().conversations[0]!; const user = userEvent.setup();
    show(<ConversationPage />, `/messages/${conversation.id}`, "/messages/:id");
    const composer = await screen.findByLabelText("Tin nhắn");
    await waitFor(() => expect(composer).not.toBeDisabled());
    await user.type(composer, "Tin nhắn kiểm thử không trùng");
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    await user.click(await screen.findByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(db().messages.filter((entry) => entry.content === "Tin nhắn kiểm thử không trùng")).toHaveLength(1));
    expect(send.mock.calls[0]?.[1].client_message_id).toBe(send.mock.calls[1]?.[1].client_message_id);
    send.mockRestore();
  });

  it("loads the canonical Hồ Chí Minh province only once on the product form", async () => {
    show(<ProductFormPage />, "/account/products/new");
    await waitFor(() => expect(document.querySelector('option[value="VN-52"]')).toBeInTheDocument());
    expect(document.querySelector('option[value="VN-65"]')).not.toBeInTheDocument();
  });
});
