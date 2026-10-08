import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../lib/queryClient";
import { httpContext, page } from "../tests/http-context";
import { member } from "../tests/test-data";
import { AppRouter } from "./router";
import { SessionProvider } from "./SessionProvider";

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

  it("keeps locked accounts out of messages after the layout change", async () => {
    context.viewer = { ...member, status: "LOCKED" };
    show("/messages");
    await waitFor(() => expect(window.location.pathname).toBe("/orders"));
    await screen.findAllByRole("heading", { name: "Đơn mua", level: 1 });
    expect(context.requests("GET", "/conversations")).toHaveLength(0);
  });

  it("shows the number of available cart items in the checkout action", async () => {
    const item = { product_id: "available-item", title: "Món đồ kiểm thử", price: "100000", image_url: null, condition: "GOOD", province_label: "Hà Nội", available: true, unavailable_reason: null };
    context.reply("GET", "/cart", { total_items: 2, groups: [{ seller: { id: "seller-test", name: "Người bán" }, items: [item, { ...item, product_id: "unavailable-item", available: false, unavailable_reason: "Đã bán" }] }] });
    show("/cart");
    expect(await screen.findByRole("button", { name: "Tiến hành đặt hàng (1)" })).toBeEnabled();
    expect(screen.getByText("Tạm tính (1 món)")).toBeInTheDocument();
  });

  it("switches destinations from the mobile account menu and closes it", async () => {
    show("/favorites");
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Mở menu tài khoản" }));
    const menu = await screen.findByRole("dialog", { name: "Tài khoản của bạn" });
    await user.click(within(menu).getByRole("link", { name: "Giỏ hàng" }));
    await waitFor(() => expect(window.location.pathname).toBe("/cart"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Giỏ hàng", level: 1 })).toBeInTheDocument();
  });

  it("closes the account menu with Escape and returns focus to its button", async () => {
    show("/cart");
    const user = userEvent.setup();
    const trigger = await screen.findByRole("button", { name: "Mở menu tài khoản" });
    await user.click(trigger);
    await screen.findByRole("dialog", { name: "Tài khoản của bạn" });
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
