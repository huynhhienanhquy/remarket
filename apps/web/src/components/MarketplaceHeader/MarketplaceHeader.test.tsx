import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/config/queryClient";
import { SessionProvider } from "@/contexts/SessionContext";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { MobileBottomNav } from "@/components/MobileBottomNav/MobileBottomNav";
import { failure, httpContext } from "@/tests/http-context";
import { member, product, seller } from "@/tests/test-data";
import { CartPage } from "@/pages/CartPage/CartPage";
import { MarketplaceHeader } from "./MarketplaceHeader";

const realtime = vi.hoisted(() => ({
  event: null as ((event: string) => void) | null,
  socket: { on: vi.fn(), onAny: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn() },
}));
vi.mock("socket.io-client", () => ({ io: () => realtime.socket }));

let context: ReturnType<typeof httpContext>;
const clients: ReturnType<typeof createQueryClient>[] = [];
function show(withCart = false) {
  const client = createQueryClient();
  clients.push(client);
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  render(<QueryClientProvider client={client}><MemoryRouter><SessionProvider><RealtimeProvider>
    <MarketplaceHeader search="" onSearchChange={() => {}} onSearchSubmit={() => {}} categories={[]} showSearchRow={false} />
    <MobileBottomNav />
    {withCart && <CartPage />}
  </RealtimeProvider></SessionProvider></MemoryRouter></QueryClientProvider>);
}
function desktop() { return within(screen.getByRole("navigation", { name: "Tiện ích" })); }
function mobile() { return within(screen.getByRole("navigation", { name: "Tiện ích di động" })); }

beforeEach(() => {
  vi.clearAllMocks();
  realtime.event = null;
  realtime.socket.onAny.mockImplementation((listener: (event: string) => void) => { realtime.event = listener; });
  context = httpContext({ ...member });
  context.reply("GET", "/notifications/navigation-counts", { messages: 0, notifications: 9, cart: 0 });
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.unstubAllGlobals(); });

describe("message badges in marketplace navigation", () => {
  it("shares the true count between desktop and mobile topbars and exposes the full count above 99", async () => {
    context.reply("GET", "/notifications/navigation-counts", { messages: 104, notifications: 9, cart: 2 });
    show();
    const header = await desktop().findByRole("link", { name: "Tin nhắn: 104 chưa đọc" });
    const mobileHeader = await mobile().findByRole("link", { name: "Tin nhắn: 104 chưa đọc" });
    expect(within(header).getByText("99+")).toBeInTheDocument();
    expect(within(mobileHeader).getByText("99+")).toBeInTheDocument();
    expect(header).toHaveAttribute("href", "/messages");
    expect(mobileHeader).toHaveAttribute("href", "/messages");
    expect(mobile().getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/messages", "/notifications", "/cart"]);
    expect(mobile().queryByRole("link", { name: "Tài khoản" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Điều hướng chính" })).queryByRole("link", { name: /Tin nhắn/ })).not.toBeInTheDocument();
    expect(context.requests("GET", "/notifications/navigation-counts")).toHaveLength(1);
    expect(context.requests("GET", "/cart")).toHaveLength(0);
    expect(context.requests("GET", "/notifications/unread-count")).toHaveLength(0);
    expect(context.requests("GET", "/conversations/unread-count")).toHaveLength(0);
    expect(desktop().getByRole("link", { name: "Thông báo: 9 chưa đọc" })).toBeInTheDocument();
    expect(desktop().getByRole("link", { name: "Giỏ hàng: 2 chưa đọc" })).toBeInTheDocument();
  });

  it("refetches authoritative counts on new/read events so duplicate events cannot inflate the badge", async () => {
    show();
    const header = await desktop().findByRole("link", { name: "Tin nhắn" });
    expect(header.querySelector("span")).toBeNull();
    await waitFor(() => expect(realtime.event).not.toBeNull());
    context.reply("GET", "/notifications/navigation-counts", { messages: 3, notifications: 9, cart: 0 });
    await act(async () => { realtime.event?.("message:created"); realtime.event?.("message:created"); });
    expect(await desktop().findByRole("link", { name: "Tin nhắn: 3 chưa đọc" })).toBeInTheDocument();
    expect(await mobile().findByRole("link", { name: "Tin nhắn: 3 chưa đọc" })).toBeInTheDocument();
    context.reply("GET", "/notifications/navigation-counts", { messages: 0, notifications: 9, cart: 0 });
    await act(async () => { realtime.event?.("conversation:read"); });
    expect(await desktop().findByRole("link", { name: "Tin nhắn" })).toBeInTheDocument();
    expect(await mobile().findByRole("link", { name: "Tin nhắn" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Tin nhắn: 3 chưa đọc")).not.toBeInTheDocument();
  });

  it("hides unknown counts when the count request fails", async () => {
    context.on("GET", "/notifications/navigation-counts", () => failure(503, "RETRY_LATER"));
    show();
    await waitFor(() => expect(context.requests("GET", "/notifications/navigation-counts")).toHaveLength(1));
    expect(await desktop().findByRole("link", { name: "Tin nhắn" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Tin nhắn: \d/)).not.toBeInTheDocument();
  });

  it("refreshes the header count after removing a cart item without waiting for realtime", async () => {
    context.reply("GET", "/notifications/navigation-counts", { messages: 0, notifications: 0, cart: 1 });
    context.reply("GET", "/cart", { total_items: 1, groups: [{ seller, items: [{
      delivery_method: "BOTH", shipping_fee: "0", product_id: product.id, title: product.title,
      price: product.price, image_url: null, condition: "GOOD", status: "ACTIVE", province_label: null,
      available: true, unavailable_reason: null,
    }] }] });
    context.on("DELETE", `/cart/items/${product.id}`, () => {
      context.reply("GET", "/cart", { groups: [], total_items: 0 });
      context.reply("GET", "/notifications/navigation-counts", { messages: 0, notifications: 0, cart: 0 });
      return { groups: [], total_items: 0 };
    });
    show(true);
    await desktop().findByRole("link", { name: "Giỏ hàng: 1 chưa đọc" });
    await userEvent.click(await screen.findByRole("button", { name: `Xóa ${product.title} khỏi giỏ hàng` }));
    await desktop().findByRole("link", { name: "Giỏ hàng" });
    expect(context.requests("GET", "/notifications/navigation-counts")).toHaveLength(2);
  });

  it.each([null, { ...member, status: "LOCKED" as const }])("does not request a separate inbox for a guest or locked account", async (viewer) => {
    context.viewer = viewer;
    show();
    await desktop().findByRole("link", { name: "Giỏ hàng" });
    await waitFor(() => expect(context.requests("POST", "/auth/bootstrap")).toHaveLength(1));
    expect(context.requests("GET", "/conversations/unread-count")).toHaveLength(0);
    if (!viewer) expect(context.requests("GET", "/notifications/navigation-counts")).toHaveLength(0);
    expect(screen.queryByLabelText(/^Tin nhắn: \d/)).not.toBeInTheDocument();
  });
});
