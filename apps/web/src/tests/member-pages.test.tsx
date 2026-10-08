import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SessionProvider, useSession } from "../app/SessionProvider";
import { ToastProvider } from "../components/ui";
import { createQueryClient } from "../lib/queryClient";
import { AccountPage } from "../pages/account/AccountPage";
import { FavoritesPage } from "../pages/account/FavoritesPage";
import { NotificationsPage } from "../pages/account/NotificationsPage";
import { ConversationPage } from "../pages/chat/ConversationPage";
import { SupportNewPage } from "../pages/support/SupportNewPage";
import { SupportTicketPage } from "../pages/support/SupportTicketPage";
import { ProductFormPage } from "../pages/account/ProductFormPage";
import { CheckoutPage } from "../pages/checkout/CheckoutPage";
import { ProductDetailPage } from "../pages/discovery/ProductDetailPage";
import { failure, httpContext, page } from "./http-context";
import { member, product, seller, ticket, timestamp } from "./test-data";

let context: ReturnType<typeof httpContext>;
const clients: ReturnType<typeof createQueryClient>[] = [];
function CheckoutTarget() { const location = useLocation(); return <h1>{`Checkout ${location.search}`}</h1>; }
function ReadySession({ children }: { children: ReactNode }) {
  return useSession().status === "ready" ? children : null;
}
function show(element: ReactNode, path = "/account", route = path.split("?")[0]!) {
  const client = createQueryClient();
  clients.push(client);
  client.setDefaultOptions({ queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[path]}><SessionProvider><ReadySession><ToastProvider><Routes>
    <Route path={route} element={element} />
    <Route path="/support/:id" element={<SupportTicketPage />} />
    <Route path="/sales/:id" element={<h1>Đơn bán đã mở</h1>} />
    <Route path="/orders/:id" element={<h1>Đơn mua đã tạo</h1>} />
    <Route path="/checkout" element={<CheckoutTarget />} />
    <Route path="/login" element={<h1>Đăng nhập để tiếp tục</h1>} />
  </Routes></ToastProvider></ReadySession></SessionProvider></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
  it("buys only the viewed product, not every existing item in the cart", async () => {
    context.reply("POST", "/cart/items", {});
    show(<ProductDetailPage />, "/products/" + product.id, "/products/:id");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Mua ngay" })[0]).not.toBeDisabled());
    await userEvent.click(screen.getAllByRole("button", { name: "Mua ngay" })[0]!);
    expect(await screen.findByRole("heading", { name: "Checkout ?items=" + product.id })).toBeInTheDocument();
    expect(context.requests("POST", "/cart/items")[0]?.body).toEqual({ product_id: product.id });
  });
  it("asks a guest to log in before adding an item to the cart", async () => {
    context.viewer = null;
    show(<ProductDetailPage />, "/products/" + product.id, "/products/:id");
    await waitFor(() => expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).not.toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));
    expect(await screen.findByRole("heading", { name: "Đăng nhập để tiếp tục" })).toBeInTheDocument();
    expect(context.requests("POST", "/cart/items")).toHaveLength(0);
  });
  it("submits canonical checkout fields and preserves the idempotency key on network retry", async () => {
    context.reply("GET", "/cart", { groups: [{ seller, items: [{
      product_id: product.id, title: product.title, price: product.price, image_url: null,
      condition: "GOOD", status: "ACTIVE", province_label: "Hà Nội", available: true, unavailable_reason: null,
    }] }], total_items: 1 });
    context.on("POST", "/checkout", () => {
      if (context.requests("POST", "/checkout").length === 1) throw new Error("Network unavailable");
      return { checkout_request_id: "checkout-test", orders: [{ id: "order-test" }] };
    });
    show(<CheckoutPage />, "/checkout?items=" + product.id, "/checkout");
    await waitFor(() => expect(screen.getByLabelText("Phí giao hàng")).toHaveValue("30000"));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Đặt hàng" }));
    await waitFor(() => expect(context.requests("POST", "/checkout")).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Đặt hàng" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Đặt hàng" }));
    expect(await screen.findByRole("heading", { name: "Đơn mua đã tạo" })).toBeInTheDocument();
    const [first, second] = context.requests("POST", "/checkout");
    expect(first?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(second?.headers.get("Idempotency-Key")).toBe(first?.headers.get("Idempotency-Key"));
    expect(second?.body).toEqual({
      items: [{ product_id: product.id, expected_price: product.price }],
      deliveries: [{ seller_id: seller.id, method: "COD", expected_shipping_fee: "30000",
        recipient_name: member.full_name, recipient_phone: member.phone, delivery_address: member.default_address }],
    });
  });
  it("saves profile changes and exposes password recovery", async () => {
    context.on("PATCH", "/auth/profile", (request) => {
      context.viewer = { ...member, ...(request.body as Partial<typeof member>) };
      return context.viewer;
    });
    const user = userEvent.setup(); show(<AccountPage />);
    const name = await screen.findByLabelText(/Họ tên/);
    await user.clear(name); await user.type(name, "Tên hồ sơ mới");
    await user.click(screen.getByRole("button", { name: "Lưu thay đổi" }));
    await waitFor(() => expect(context.requests("PATCH", "/auth/profile")).toHaveLength(1));
    await waitFor(() => expect(screen.getByLabelText(/Họ tên/)).toHaveValue("Tên hồ sơ mới"));
    expect(screen.getByRole("link", { name: "Đặt lại mật khẩu" })).toHaveAttribute("href", "/forgot-password");
  });
  it("removes a hidden saved item without revealing its title", async () => {
    context.reply("GET", "/favorites", page([{ ...product, title: "", price: "0", images: [], is_hidden: true, is_favorited: true }]));
    context.on("DELETE", "/favorites/" + product.id, () => {
      context.reply("GET", "/favorites", page([])); return {};
    });
    show(<FavoritesPage />, "/favorites");
    await screen.findByText("Tin đăng không còn khả dụng");
    expect(screen.queryByText(product.title)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lưu" }));
    expect(await screen.findByText("Bạn chưa lưu món đồ nào")).toBeInTheDocument();
    expect(context.requests("DELETE", "/favorites/" + product.id)).toHaveLength(1);
  });
  it("opens a seller notification using the authorized order role", async () => {
    context.reply("GET", "/notifications", { ...page([{
      id: "notification-test", user_id: member.id, type: "ORDER_CREATED",
      title: "Thông báo đơn bán kiểm thử", content: "Nội dung an toàn",
      reference_type: "order", reference_id: "order-test", read_at: null, created_at: timestamp,
    }]), meta: { ...page([]).meta, total: 1, unread: 1 } });
    context.reply("POST", "/notifications/notification-test/read", {});
    context.reply("GET", "/orders/order-test", { id: "order-test", role: "seller" });
    show(<NotificationsPage />, "/notifications");
    await userEvent.click(await screen.findByRole("button", { name: /Thông báo đơn bán kiểm thử/ }));
    expect(await screen.findByRole("heading", { name: "Đơn bán đã mở" })).toBeInTheDocument();
    expect(context.requests("POST", "/notifications/notification-test/read")).toHaveLength(1);
  });
  it("lets a locked user create and reply to an account support request", async () => {
    context.viewer = { ...member, status: "LOCKED" };
    context.reply("POST", "/support/tickets", ticket);
    context.reply("GET", "/support/tickets/" + ticket.id, ticket);
    context.on("POST", "/support/tickets/" + ticket.id + "/messages", (request) => ({
      ...ticket, messages: [{ id: "reply-test", sender: { id: member.id, name: member.full_name, role: "USER" },
        message: (request.body as { message: string }).message, created_at: timestamp }],
    }));
    const user = userEvent.setup(); show(<SupportNewPage />, "/support/new");
    await user.type(await screen.findByLabelText(/Tiêu đề/), ticket.subject);
    await user.type(screen.getByLabelText(/Nội dung/), "Tôi muốn được kiểm tra lại tài khoản bị khóa.");
    await user.click(screen.getByRole("button", { name: "Gửi yêu cầu" }));
    await user.type(await screen.findByLabelText(/Phản hồi/), "Thông tin bổ sung của tôi");
    await user.click(screen.getByRole("button", { name: "Gửi phản hồi" }));
    expect(await screen.findByText("Thông tin bổ sung của tôi")).toBeInTheDocument();
    expect(context.requests("POST", "/support/tickets")[0]?.body).toMatchObject({ type: "ACCOUNT" });
  });
  it("renders the reopened ticket returned after replying to a resolved request", async () => {
    context.reply("GET", "/support/tickets/" + ticket.id, { ...ticket, status: "RESOLVED", resolution_note: "Kết luận cũ" });
    context.reply("POST", "/support/tickets/" + ticket.id + "/messages", ticket);
    const user = userEvent.setup(); show(<SupportTicketPage />, "/support/" + ticket.id, "/support/:id");
    expect(await screen.findByText("Kết luận cũ")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/Phản hồi/), "Vấn đề vẫn còn xảy ra");
    await user.click(screen.getByRole("button", { name: "Vẫn cần hỗ trợ" }));
    await waitFor(() => expect(screen.queryByText("Kết luận cũ")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Gửi phản hồi" })).toBeInTheDocument();
  });
  it.each(["network failure", "retryable database conflict"])("reuses the chat client id after a %s", async (reason) => {
    const conversation = { id: "conversation-test", can_send: true, unavailable_reason: null,
      counterparty: { id: seller.id, name: seller.name, avatar_url: null },
      product: { id: product.id, title: product.title, image_url: null, price: product.price, status: "ACTIVE" },
      last_message: null, unread_count: 0, updated_at: timestamp };
    context.reply("GET", "/conversations", page([conversation]));
    context.reply("GET", "/conversations/conversation-test", conversation);
    context.reply("GET", "/conversations/conversation-test/messages", { items: [], next_cursor: null });
    context.reply("POST", "/conversations/conversation-test/read", {});
    context.on("POST", "/conversations/conversation-test/messages", (request) => {
      if (context.requests("POST", request.path).length === 1) {
        if (reason === "network failure") throw new Error("Network unavailable");
        return failure(409, "RETRY_LATER");
      }
      return { message: { id: "message-test", ...(request.body as object), sender_id: member.id, created_at: timestamp, read_at: null } };
    });
    const user = userEvent.setup(); show(<ConversationPage />, "/messages/conversation-test", "/messages/:id");
    const composer = await screen.findByLabelText("Tin nhắn");
    await waitFor(() => expect(composer).not.toBeDisabled());
    await user.type(composer, "Tin nhắn kiểm thử không trùng");
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    await user.click(await screen.findByRole("button", { name: "Thử lại" }));
    await waitFor(() => expect(context.requests("POST", "/conversations/conversation-test/messages")).toHaveLength(2));
    const [first, second] = context.requests("POST", "/conversations/conversation-test/messages");
    expect(first?.body).toEqual(second?.body);
    expect((first?.body as { client_message_id: string }).client_message_id).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument());
  });
  it("loads canonical Hồ Chí Minh codes from the API only once", async () => {
    show(<ProductFormPage />, "/account/products/new");
    await waitFor(() => expect(document.querySelector('option[value="VN-52"]')).toBeInTheDocument());
    expect(document.querySelector('option[value="VN-65"]')).not.toBeInTheDocument();
    expect(context.requests("GET", "/provinces")).toHaveLength(1);
  });
});
