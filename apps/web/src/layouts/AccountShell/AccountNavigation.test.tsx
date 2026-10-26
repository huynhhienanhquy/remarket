import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../config/queryClient";
import { httpContext, page } from "../../tests/http-context";
import { member, seller, timestamp } from "../../tests/test-data";
import { AppRouter } from "../../config/route/router";
import { SessionProvider } from "../../contexts/SessionContext";

const destinations = [
  ["/account", "Hồ sơ cá nhân"],
  ["/favorites", "Yêu thích"],
  ["/cart", "Giỏ hàng"],
  ["/orders", "Đơn mua"],
  ["/account/products", "Tin đăng của tôi"],
  ["/sales", "Đơn bán"],
  ["/messages", "Tin nhắn"],
  ["/notifications", "Thông báo"],
  ["/support", "Hỗ trợ"],
] as const;
const clients: ReturnType<typeof createQueryClient>[] = [];
let context: ReturnType<typeof httpContext>;

function show(path: string) {
  window.history.replaceState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  const client = createQueryClient();
  clients.push(client);
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  render(<QueryClientProvider client={client}><SessionProvider><AppRouter /></SessionProvider></QueryClientProvider>);
}

beforeEach(() => {
  context = httpContext({ ...member });
  context.reply("GET", "/cart", { groups: [], total_items: 0 });
  context.reply("GET", "/notifications/unread-count", 0);
  context.reply("GET", "/favorites", page([]));
  context.reply("GET", "/orders", page([]));
  context.reply("GET", "/account/products", page([]));
  context.reply("GET", "/conversations", page([]));
  context.reply("GET", "/notifications", { ...page([]), meta: { ...page([]).meta, unread: 0 } });
  context.reply("GET", "/support/tickets", page([]));
});

afterEach(() => {
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("account navigation through the application router", () => {
  it.each(destinations)("keeps the shared menu and active destination on %s", async (path, label) => {
    show(path);
    await screen.findAllByRole("heading", { name: label, level: 1 });
    const sidebar = screen.getAllByRole("navigation", { name: "Tài khoản" })[0]!;
    for (const [destination, name] of destinations) {
      expect(within(sidebar).getByRole("link", { name })).toHaveAttribute("href", destination);
    }
    expect(within(sidebar).getByRole("link", { name: label })).toHaveAttribute("aria-current", "page");
    expect(sidebar.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
    await waitFor(() => expect(document.querySelector("main .rm-skeleton")).toBeNull());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["/cart", "/messages"])("preserves the guest login return target for %s", async (path) => {
    context.viewer = null;
    show(path);
    await screen.findByRole("heading", { name: "Đăng nhập", level: 1 });
    expect(window.location.pathname).toBe("/login");
    expect(new URLSearchParams(window.location.search).get("returnTo")).toBe(path);
    expect(context.requests("GET", "/cart")).toHaveLength(0);
    expect(context.requests("GET", "/conversations")).toHaveLength(0);
  });

  it("opens and switches conversations in the inbox panel while preserving the account layout and list page", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    const first = { id: "official-chat", is_system: true, can_send: true, unavailable_reason: null,
      counterparty: { id: "private-admin", name: "Hệ thống ReMarket", avatar_url: null, is_system: true },
      product: null, last_message: null, unread_count: 0, updated_at: timestamp };
    const second = { ...first, id: "seller-chat", is_system: false,
      counterparty: { id: seller.id, name: seller.name, avatar_url: null, is_system: false } };
    context.reply("GET", "/conversations", { items: [first, second], meta: { page: 2, page_size: 20, total: 22, total_pages: 2 } });
    for (const conversation of [first, second]) {
      context.reply("GET", `/conversations/${conversation.id}`, conversation);
      context.reply("GET", `/conversations/${conversation.id}/messages`, { items: [{
        id: `${conversation.id}-message`, client_message_id: `${conversation.id}-client`,
        sender_id: conversation.counterparty.id, content: `Nội dung ${conversation.id}`,
        created_at: timestamp, read_at: timestamp, is_system: conversation.is_system,
      }], next_cursor: null });
      context.reply("POST", `/conversations/${conversation.id}/read`, { unread: 0, updated: 0, read_at: timestamp });
    }
    context.on("POST", "/conversations/official-chat/messages", ({ body }) => ({ message: {
      ...(body as object), id: "reply-message", sender_id: member.id, created_at: timestamp, read_at: null,
    } }));

    show("/messages?page=2");
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Bắt đầu cuộc trò chuyện" });
    const sidebar = screen.getAllByRole("navigation", { name: "Tài khoản" })[0]!;
    const list = screen.getByRole("complementary", { name: "Danh sách cuộc trò chuyện" });
    const firstLink = await within(list).findByRole("link", { name: /Hệ thống ReMarket/ });
    list.scrollTop = 120;
    await user.click(firstLink);

    const panel = await screen.findByRole("region", { name: "Nội dung cuộc trò chuyện" });
    expect(await within(panel).findByText("Nội dung official-chat")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Danh sách cuộc trò chuyện" })).toBe(list);
    expect(list.scrollTop).toBe(120);
    expect(screen.getAllByRole("navigation", { name: "Tài khoản" })[0]).toBe(sidebar);
    expect(within(sidebar).getByRole("link", { name: "Tin nhắn" })).toHaveAttribute("aria-current", "page");
    expect(firstLink).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("heading", { name: "Bắt đầu cuộc trò chuyện" })).not.toBeInTheDocument();
    expect(window.location.pathname + window.location.search).toBe("/messages/official-chat?page=2");

    await user.type(within(panel).getByLabelText("Tin nhắn"), "Trả lời trong khung bên phải");
    await user.click(within(panel).getByRole("button", { name: "Gửi tin nhắn" }));
    expect(await within(panel).findByText("Trả lời trong khung bên phải")).toBeInTheDocument();
    await waitFor(() => expect(context.requests("POST", "/conversations/official-chat/messages")).toHaveLength(1));

    const secondLink = within(list).getByRole("link", { name: new RegExp(seller.name) });
    await user.click(secondLink);
    const nextPanel = screen.getByRole("region", { name: "Nội dung cuộc trò chuyện" });
    expect(await within(nextPanel).findByText("Nội dung seller-chat")).toBeInTheDocument();
    expect(within(nextPanel).queryByText("Nội dung official-chat")).not.toBeInTheDocument();
    expect(within(nextPanel).getByLabelText("Tin nhắn")).toHaveValue("");
    expect(secondLink).toHaveAttribute("aria-current", "page");
    expect(firstLink).not.toHaveAttribute("aria-current");

    await user.click(screen.getByRole("link", { name: "Quay lại" }));
    await screen.findByRole("heading", { name: "Bắt đầu cuộc trò chuyện" });
    expect(window.location.pathname + window.location.search).toBe("/messages?page=2");
    expect(screen.queryByRole("region", { name: "Nội dung cuộc trò chuyện" })).not.toBeInTheDocument();
    expect(context.requests("GET", "/conversations").every(({ url }) => url.searchParams.get("page") === "2")).toBe(true);
  });

  it("keeps locked accounts out of messages after the layout change", async () => {
    context.viewer = { ...member, status: "LOCKED" };
    show("/messages");
    await waitFor(() => expect(window.location.pathname).toBe("/orders"));
    await screen.findAllByRole("heading", { name: "Đơn mua", level: 1 });
    expect(context.requests("GET", "/conversations")).toHaveLength(0);
  });

  it("shows the number of available cart items in the checkout action", async () => {
    const item = {delivery_method: "BOTH", shipping_fee: "0",  product_id: "available-item", title: "Món đồ kiểm thử", price: "100000", image_url: null, condition: "GOOD", status: "ACTIVE", province_label: "Hà Nội", available: true, unavailable_reason: null };
    context.reply("GET", "/cart", { total_items: 2, groups: [{ seller, items: [item, { ...item, product_id: "unavailable-item", available: false, unavailable_reason: "Đã bán" }] }] });
    show("/cart");
    expect(await screen.findByRole("button", { name: "Tiến hành đặt hàng (1)" })).toBeEnabled();
    expect(screen.getByText("Tạm tính (1 món)")).toBeInTheDocument();
  });

  it("switches destinations from the mobile account menu and closes it", async () => {
    show("/favorites");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Menu" }));
    const menu = await screen.findByRole("dialog", { name: "Menu" });
    await user.click(within(menu).getByRole("link", { name: "Giỏ hàng" }));
    await waitFor(() => expect(window.location.pathname).toBe("/cart"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Giỏ hàng", level: 1 })).toBeInTheDocument();
  });

  it("closes the account menu with Escape and returns focus to its button", async () => {
    show("/cart");
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Menu" });
    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Menu" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
