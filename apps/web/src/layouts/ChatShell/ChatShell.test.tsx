import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "../../components/common";
import { createQueryClient } from "../../config/queryClient";
import { SessionProvider, useSession } from "../../contexts/SessionContext";
import { AdminUsersPage } from "../../pages/AdminUsersPage/AdminUsersPage";
import { ConversationPage } from "../../pages/ConversationPage/ConversationPage";
import { httpContext, page } from "../../tests/http-context";
import { member, timestamp } from "../../tests/test-data";
import { ChatShell } from "./ChatShell";

const admin = { ...member, id: "admin-test", role: "ADMIN" as const };
const target = { ...member, id: "alice", full_name: "Người nhận", created_at: timestamp, province_label: "Hà Nội", lock_reason: null, locked_at: null };
const conversation = { id: "official-chat", is_system: true, can_send: true, unavailable_reason: null,
  counterparty: { id: target.id, name: target.full_name, avatar_url: null }, product: null,
  last_message: null, unread_count: 0, updated_at: timestamp };
let context: ReturnType<typeof httpContext>;
let client: ReturnType<typeof createQueryClient>;

function Ready({ children }: { children: ReactNode }) { return useSession().status === "ready" ? children : null; }
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname + location.search}</output>; }
function show(path: string) {
  render(<QueryClientProvider client={client}><SessionProvider><Ready><MemoryRouter initialEntries={[path]}><ToastProvider>
    <Location /><Routes>
      <Route path="/admin/users" element={<AdminUsersPage />} />
      <Route element={<ChatShell />}><Route path="/messages/:id" element={<ConversationPage />} /></Route>
      <Route path="/messages" element={<h1>Hộp thư người dùng</h1>} />
    </Routes>
  </ToastProvider></MemoryRouter></Ready></SessionProvider></QueryClientProvider>);
}

beforeEach(() => {
  context = httpContext(admin);
  client = createQueryClient();
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  context.reply("GET", "/admin/users", { items: [target], meta: { page: 3, page_size: 20, total: 41, total_pages: 3 } });
  context.reply("GET", "/admin/users/alice", target);
  context.reply("GET", "/admin/products", page([]));
  context.reply("POST", "/admin/users/alice/conversation", { conversation_id: conversation.id });
  context.reply("GET", "/conversations", page([conversation]));
  for (const id of [conversation.id, "another-chat"]) {
    context.reply("GET", `/conversations/${id}`, { ...conversation, id });
    context.reply("GET", `/conversations/${id}/messages`, { items: [], next_cursor: null });
    context.on("POST", `/conversations/${id}/messages`, ({ body }) => ({ message: { ...(body as object), id: "sent-message", sender_id: admin.id, created_at: timestamp, read_at: null, is_system: true } }));
  }
});
afterEach(() => { client.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("return from admin chat", () => {
  it("returns to the selected user and exact admin filters after sending a message", async () => {
    const origin = "/admin/users?page=3&status=ACTIVE&q=An&selected=alice";
    const user = userEvent.setup();
    show(origin);
    await user.click(await screen.findByRole("button", { name: "Nhắn tin hệ thống" }));
    const composer = await screen.findByLabelText("Tin nhắn");
    await waitFor(() => expect(composer).not.toBeDisabled());
    await user.type(composer, "Thông báo kiểm thử");
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    await waitFor(() => expect(context.requests("POST", "/conversations/official-chat/messages")).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "Quay lại quản trị" }));
    expect(await screen.findByRole("dialog", { name: "Chi tiết người dùng" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(origin);
    expect(screen.getByRole("combobox", { name: "Trạng thái" })).toHaveValue("ACTIVE");
    expect(within(screen.getByRole("dialog")).getByText(target.full_name)).toBeInTheDocument();
    expect(context.requests("GET", "/admin/users").every(({ url }) => url.searchParams.get("page") === "3")).toBe(true);
    expect(screen.queryByRole("heading", { name: "Hộp thư người dùng" })).not.toBeInTheDocument();
  });

  it("retains the admin return destination through inbox pagination and conversation changes", async () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
    const origin = "/admin/users?page=3&selected=alice";
    context.reply("GET", "/conversations", { items: [conversation, { ...conversation, id: "another-chat", counterparty: { ...conversation.counterparty, name: "Người nhận khác" } }], meta: { page: 1, page_size: 20, total: 21, total_pages: 2 } });
    const user = userEvent.setup();
    show(`/messages/official-chat?${new URLSearchParams({ return_to: origin })}`);
    await screen.findByRole("heading", { name: target.full_name });
    await user.click(screen.getByRole("button", { name: "Sau" }));
    expect(new URLSearchParams(screen.getByTestId("location").textContent!.split("?")[1]).get("return_to")).toBe(origin);
    await user.click(screen.getByRole("link", { name: /Người nhận khác/ }));
    await user.click(screen.getByRole("button", { name: "Quay lại quản trị" }));
    expect(await screen.findByRole("dialog", { name: "Chi tiết người dùng" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(origin);
  });

  it.each([undefined, "https://outside.test/admin", "/admin/../messages", "//outside.test/admin"])("keeps direct or invalid admin returns in the admin area: %s", async (returnTo) => {
    const user = userEvent.setup();
    show(`/messages/official-chat${returnTo ? `?${new URLSearchParams({ return_to: returnTo })}` : ""}`);
    await user.click(await screen.findByRole("button", { name: "Quay lại quản trị" }));
    await screen.findByRole("heading", { name: "Người dùng", level: 1 });
    expect(screen.getByTestId("location")).toHaveTextContent("/admin/users");
  });

  it("keeps ordinary user chat returning to their inbox", async () => {
    context.viewer = member;
    const user = userEvent.setup();
    show(`/messages/official-chat?${new URLSearchParams({ return_to: "/admin/users" })}`);
    await user.click(await screen.findByRole("link", { name: "Quay lại" }));
    expect(await screen.findByRole("heading", { name: "Hộp thư người dùng" })).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/messages");
  });
});
