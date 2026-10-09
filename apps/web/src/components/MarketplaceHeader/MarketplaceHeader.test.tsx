import { QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/config/queryClient";
import { SessionProvider } from "@/contexts/SessionContext";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { MobileBottomNav } from "@/components/MobileBottomNav/MobileBottomNav";
import { failure, httpContext } from "@/tests/http-context";
import { member } from "@/tests/test-data";
import { MarketplaceHeader } from "./MarketplaceHeader";

const realtime = vi.hoisted(() => ({
  event: null as ((event: string) => void) | null,
  socket: { on: vi.fn(), onAny: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn() },
}));
vi.mock("socket.io-client", () => ({ io: () => realtime.socket }));

let context: ReturnType<typeof httpContext>;
const clients: ReturnType<typeof createQueryClient>[] = [];
function show() {
  const client = createQueryClient();
  clients.push(client);
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  render(<QueryClientProvider client={client}><MemoryRouter><SessionProvider><RealtimeProvider>
    <MarketplaceHeader search="" onSearchChange={() => {}} onSearchSubmit={() => {}} categories={[]} showSearchRow={false} />
    <MobileBottomNav />
  </RealtimeProvider></SessionProvider></MemoryRouter></QueryClientProvider>);
}
function desktop() { return within(screen.getByRole("navigation", { name: "Tiện ích" })); }
function mobile() { return within(screen.getByRole("navigation", { name: "Điều hướng chính" })); }

beforeEach(() => {
  vi.clearAllMocks();
  realtime.event = null;
  realtime.socket.onAny.mockImplementation((listener: (event: string) => void) => { realtime.event = listener; });
  context = httpContext({ ...member });
  context.reply("GET", "/cart", { groups: [], total_items: 0 });
  context.reply("GET", "/notifications/unread-count", 9);
});
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.unstubAllGlobals(); });

describe("message badges in marketplace navigation", () => {
  it("shares the true count between desktop and mobile and exposes the full count above 99", async () => {
    context.reply("GET", "/conversations/unread-count", 104);
    show();
    const header = await desktop().findByRole("link", { name: "Tin nhắn: 104 chưa đọc" });
    const bottom = await mobile().findByRole("link", { name: "Tin nhắn: 104 chưa đọc" });
    expect(within(header).getByText("99+")).toBeInTheDocument();
    expect(within(bottom).getByText("99+")).toBeInTheDocument();
    expect(header).toHaveAttribute("href", "/messages");
    expect(bottom).toHaveAttribute("href", "/messages");
    expect(context.requests("GET", "/conversations/unread-count")).toHaveLength(1);
    expect(desktop().getByRole("link", { name: "Thông báo: 9 chưa đọc" })).toBeInTheDocument();
  });

  it("refetches authoritative counts on new/read events so duplicate events cannot inflate the badge", async () => {
    show();
    const header = await desktop().findByRole("link", { name: "Tin nhắn" });
    expect(header.querySelector("span")).toBeNull();
    await waitFor(() => expect(realtime.event).not.toBeNull());
    context.reply("GET", "/conversations/unread-count", 3);
    await act(async () => { realtime.event?.("message:created"); realtime.event?.("message:created"); });
    expect(await desktop().findByRole("link", { name: "Tin nhắn: 3 chưa đọc" })).toBeInTheDocument();
    expect(await mobile().findByRole("link", { name: "Tin nhắn: 3 chưa đọc" })).toBeInTheDocument();
    context.reply("GET", "/conversations/unread-count", 0);
    await act(async () => { realtime.event?.("conversation:read"); });
    expect(await desktop().findByRole("link", { name: "Tin nhắn" })).toBeInTheDocument();
    expect(await mobile().findByRole("link", { name: "Tin nhắn" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Tin nhắn: 3 chưa đọc")).not.toBeInTheDocument();
  });

  it("hides unknown counts when the count request fails", async () => {
    context.on("GET", "/conversations/unread-count", () => failure(503, "RETRY_LATER"));
    show();
    await waitFor(() => expect(context.requests("GET", "/conversations/unread-count")).toHaveLength(1));
    expect(await desktop().findByRole("link", { name: "Tin nhắn" })).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Tin nhắn: \d/)).not.toBeInTheDocument();
  });

  it.each([null, { ...member, status: "LOCKED" as const }])("does not request message counts for a guest or locked account", async (viewer) => {
    context.viewer = viewer;
    show();
    await desktop().findByRole("link", { name: "Giỏ hàng" });
    await waitFor(() => expect(context.requests("POST", "/auth/bootstrap")).toHaveLength(1));
    expect(context.requests("GET", "/conversations/unread-count")).toHaveLength(0);
    expect(screen.queryByLabelText(/^Tin nhắn: \d/)).not.toBeInTheDocument();
  });
});
