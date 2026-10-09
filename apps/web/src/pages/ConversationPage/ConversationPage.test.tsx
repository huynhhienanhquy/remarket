import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationPage } from "@/pages/ConversationPage/ConversationPage";
import { failure, httpContext, page } from "@/tests/http-context";
import { member, product, seller, timestamp } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
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
