import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  session: { findUnique: vi.fn() }, user: { findUnique: vi.fn() },
  conversation: { findUnique: vi.fn(), update: vi.fn() },
  product: { findUnique: vi.fn() },
  message: { findUnique: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), count: vi.fn(), create: vi.fn() },
  outboxEvent: { createMany: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { createApp } from "../../src/app.js";
import { sendChatMessage, markConversationRead } from "../../src/services/chat-service.js";
import { signAccessToken } from "../../src/shared/tokens.js";

const id = "00000000-0000-0000-0000-000000000010";
const user = { id: "buyer", fullName: "Buyer", email: "buyer@example.test", role: "USER" as const, status: "ACTIVE" as const, emailVerifiedAt: new Date() };
beforeEach(() => {
  vi.resetAllMocks();
  client.session.findUnique.mockResolvedValue({ userId: user.id, revokedAt: null, expiresAt: new Date(Date.now() + 60000), user });
  client.conversation.findUnique.mockResolvedValue({ buyerId: user.id, sellerId: "seller", productId: "product" });
  client.user.findUnique.mockResolvedValue(user);
  client.message.findUnique.mockResolvedValue(null);
  client.$transaction.mockImplementation(async (action: (tx: typeof client) => unknown) => action(client));
});
describe("conversation access and delivery", () => {
  it.each([0, 104])("returns the aggregate unread count %i using the static route", async (count) => {
    client.message.count.mockResolvedValue(count);
    const response = await request(createApp()).get("/api/v1/conversations/unread-count")
      .set("Authorization", `Bearer ${signAccessToken(user.id, "session")}`).expect(200);
    expect(response.body.data).toBe(count);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(client.conversation.findUnique).not.toHaveBeenCalled();
  });
  it("requires authentication for the message badge count", async () => {
    await request(createApp()).get("/api/v1/conversations/unread-count").expect(401);
    expect(client.message.count).not.toHaveBeenCalled();
  });
  it("does not expose an unread count to locked accounts", async () => {
    client.session.findUnique.mockResolvedValue({ userId: user.id, revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: { ...user, status: "LOCKED" } });
    const response = await request(createApp()).get("/api/v1/conversations/unread-count")
      .set("Authorization", `Bearer ${signAccessToken(user.id, "session")}`).expect(403);
    expect(response.body.error.code).toBe("ACCOUNT_LOCKED");
    expect(client.message.count).not.toHaveBeenCalled();
  });
  it.each([null, { buyerId: "other", sellerId: "seller" }])("does not reveal a private conversation to a nonparticipant", async (conversation) => {
    client.conversation.findUnique.mockResolvedValue(conversation);
    const response = await request(createApp()).get(`/api/v1/conversations/${id}`).set("Authorization", `Bearer ${signAccessToken(user.id, "session")}`).expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(client.conversation.findUnique).toHaveBeenCalledTimes(1);
  });
  it("prevents a locked account from reading the inbox", async () => {
    client.session.findUnique.mockResolvedValue({ userId: user.id, revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: { ...user, status: "LOCKED" } });
    const response = await request(createApp()).get(`/api/v1/conversations/${id}`).set("Authorization", `Bearer ${signAccessToken(user.id, "session")}`).expect(403);
    expect(response.body.error.code).toBe("ACCOUNT_LOCKED");
    expect(client.conversation.findUnique).not.toHaveBeenCalled();
  });
  it.each([{ isBlocked: true, deletedAt: null }, { isBlocked: false, deletedAt: new Date() }, null])("stops new messages when the listing is blocked or deleted", async (product) => {
    client.product.findUnique.mockResolvedValue(product);
    await expect(sendChatMessage({ conversationId: id, viewer: user, clientMessageId: "retry-id", content: "Xin chào" })).rejects.toMatchObject({ code: "PRODUCT_NOT_AVAILABLE" });
    expect(client.message.create).not.toHaveBeenCalled();
    expect(client.outboxEvent.createMany).not.toHaveBeenCalled();
  });
  it("acknowledges a persisted retry without creating another message", async () => {
    const message = { id: "stored" }; client.message.findUnique.mockResolvedValue(message);
    expect(await sendChatMessage({ conversationId: id, viewer: user, clientMessageId: "retry-id", content: "Xin chào" })).toEqual({ message, created: false });
    expect(client.$transaction).not.toHaveBeenCalled();
  });
  it("marks only the stable cutoff and returns the real remaining unread count", async () => {
    const timestamp = new Date(); client.message.findFirst.mockResolvedValue({ createdAt: timestamp });
    client.message.updateMany.mockResolvedValue({ count: 2 }); client.message.count.mockResolvedValue(3);
    const result = await markConversationRead({ conversationId: id, viewerId: user.id, lastMessageId: id });
    expect(result).toMatchObject({ updated: 2, unread: 3 });
    expect(client.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ createdAt: { lt: timestamp } }, { createdAt: timestamp, id: { lte: id } }] }) }));
    expect(client.outboxEvent.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({ payload: expect.objectContaining({ unread: 3 }) })] }));
  });
});
