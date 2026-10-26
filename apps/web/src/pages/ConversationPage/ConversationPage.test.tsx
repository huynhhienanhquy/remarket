import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationPage } from "@/pages/ConversationPage/ConversationPage";
import { failure, httpContext, page } from "@/tests/http-context";
import { member, product, seller, timestamp } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";
import { queryKeys } from "@/config/queryClient";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("member workflows through the HTTP adapter", () => {
  it("shows official messages as system in the inbox and history and lets the user reply", async () => {
    const conversation = { id: "official-chat", is_system: true, can_send: true, unavailable_reason: null,
      counterparty: { id: "private-admin", name: "Hệ thống ReMarket", avatar_url: null, is_system: true },
      product: null, last_message: null, unread_count: 1, updated_at: timestamp };
    const message = { id: "official-message", client_message_id: "official-client", sender_id: "private-admin",
      content: "Thông báo từ quản trị viên", created_at: timestamp, read_at: null, is_system: true };
    context.reply("GET", "/conversations", page([conversation]));
    context.reply("GET", "/conversations/official-chat", conversation);
    context.reply("GET", "/conversations/official-chat/messages", { items: [message], next_cursor: null });
    context.reply("POST", "/conversations/official-chat/read", { unread: 0, updated: 1, read_at: timestamp });
    context.on("POST", "/conversations/official-chat/messages", ({ body }) => ({ message: {
      ...(body as object), id: "reply-message", sender_id: member.id, created_at: timestamp, read_at: null,
    } }));
    const user = userEvent.setup();
    show(<ConversationPage />, "/messages/official-chat", "/messages/:id");
    expect(await screen.findByRole("heading", { name: "Hệ thống ReMarket" })).toBeInTheDocument();
    expect(await screen.findByText(message.content)).toBeInTheDocument();
    expect(screen.getByText("Tin nhắn hệ thống")).toBeInTheDocument();
    expect(screen.queryByText("Tin đăng không còn khả dụng")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Xem hồ sơ" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Hệ thống ReMarket").length).toBeGreaterThanOrEqual(2);
    const composer = await screen.findByLabelText("Tin nhắn");
    await user.type(composer, "Tôi cần được hỗ trợ thêm");
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    await waitFor(() => expect(context.requests("POST", "/conversations/official-chat/messages")).toHaveLength(1));
    expect(context.requests("POST", "/conversations/official-chat/messages")[0]?.body).toEqual({ content: "Tôi cần được hỗ trợ thêm", client_message_id: expect.any(String) });
    expect(await screen.findByText("Tôi cần được hỗ trợ thêm")).toBeInTheDocument();
  });
  it("shows and queues the next message while the first send is still awaiting the database", async () => {
    const conversation = { id: "conversation-test", can_send: true, unavailable_reason: null,
      counterparty: { id: seller.id, name: seller.name, avatar_url: null }, product: null,
      last_message: null, unread_count: 0, updated_at: timestamp };
    context.reply("GET", "/conversations", page([conversation]));
    context.reply("GET", "/conversations/conversation-test", conversation);
    context.reply("GET", "/conversations/conversation-test/messages", { items: [], next_cursor: null });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    context.on("POST", "/conversations/conversation-test/messages", async (request) => {
      if (context.requests("POST", request.path).length === 1) await gate;
      return { message: { id: crypto.randomUUID(), ...(request.body as object), sender_id: member.id, created_at: timestamp, read_at: null } };
    });
    const user = userEvent.setup(); show(<ConversationPage />, "/messages/conversation-test", "/messages/:id");
    const composer = await screen.findByLabelText("Tin nhắn");
    await waitFor(() => expect(composer).not.toBeDisabled());
    await user.type(composer, "First queued message");
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    await user.type(composer, "Second queued message");
    await user.click(screen.getByRole("button", { name: "Gửi tin nhắn" }));
    expect(await screen.findByText("First queued message")).toBeInTheDocument();
    expect(await screen.findByText("Second queued message")).toBeInTheDocument();
    expect(context.requests("POST", "/conversations/conversation-test/messages")).toHaveLength(1);
    await act(async () => { release(); });
    await waitFor(() => expect(context.requests("POST", "/conversations/conversation-test/messages")).toHaveLength(2));
    expect(context.requests("GET", "/conversations/conversation-test/messages")).toHaveLength(1);
  });
  it("marks visible messages read when history arrives before conversation details", async () => {
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 100, 100));
    const conversation = { id: "conversation-test", can_send: true, unavailable_reason: null,
      counterparty: { id: seller.id, name: seller.name, avatar_url: null },
      product: { id: product.id, title: product.title, image_url: null, price: product.price, status: "ACTIVE" },
      last_message: null, unread_count: 1, updated_at: timestamp };
    const message = { id: "incoming", client_message_id: "incoming-client", sender_id: seller.id,
      content: "Tin nhắn đến trước thông tin cuộc trò chuyện", created_at: timestamp, read_at: null };
    let finishDetails!: (value: typeof conversation) => void;
    const details = new Promise<typeof conversation>((resolve) => { finishDetails = resolve; });
    context.reply("GET", "/conversations", page([conversation]));
    context.on("GET", "/conversations/conversation-test", () => details);
    context.reply("GET", "/conversations/conversation-test/messages", { items: [message], next_cursor: null });
    context.reply("POST", "/conversations/conversation-test/read", { unread: 0, updated: 1, read_at: timestamp });
    const client = show(<ConversationPage />, "/messages/conversation-test", "/messages/:id");
    await waitFor(() => expect(client.getQueryData(queryKeys.messages("conversation-test"))).toMatchObject({ pages: [{ items: [message] }] }));
    expect(context.requests("POST", "/conversations/conversation-test/read")).toHaveLength(0);
    await act(async () => { finishDetails(conversation); });
    await screen.findByText(message.content);
    await waitFor(() => expect(context.requests("POST", "/conversations/conversation-test/read")).toHaveLength(1));
    expect(context.requests("POST", "/conversations/conversation-test/read")[0]!.body).toEqual({ last_message_id: message.id });
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
});
