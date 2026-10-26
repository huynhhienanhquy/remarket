import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  session: { findUnique: vi.fn() }, user: { findUnique: vi.fn() },
  conversation: { upsert: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  message: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() },
  userBlock: { findFirst: vi.fn() }, notification: { create: vi.fn() },
  auditLog: { create: vi.fn() }, outboxEvent: { createMany: vi.fn() },
  outboxDedupeKey: { createManyAndReturn: vi.fn() }, $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/shared/tokens.js";
import { openSystemConversation } from "../../src/services/system-chat.js";
import { sendChatMessage } from "../../src/services/chat-service.js";
import { onRealtimeEvent } from "../../src/realtime/events.js";

const admin = { id: "00000000-0000-4000-8000-000000000001", email: "admin@example.test", fullName: "Admin riêng tư", role: "ADMIN" as const,
  status: "ACTIVE" as const, emailVerifiedAt: new Date(), deletedAt: null, avatarUrl: null };
const user = { ...admin, id: "00000000-0000-4000-8000-000000000002", fullName: "Người nhận", role: "USER" as const };
const id = "00000000-0000-4000-8000-000000000003";
const thread = { id, systemKey: `${admin.id}:${user.id}`, buyerId: user.id, sellerId: admin.id, productId: null,
  buyer: user, seller: admin, product: null, messages: [], updatedAt: new Date(), _count: { messages: 1 } };
const authorization = (viewer = admin) => `Bearer ${signAccessToken(viewer.id, "session")}`;
beforeEach(() => {
  vi.resetAllMocks();
  client.session.findUnique.mockResolvedValue({ userId: admin.id, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), user: admin });
  client.$queryRaw.mockResolvedValue([admin, user]);
  client.$transaction.mockImplementation(async (action: (tx: typeof client) => unknown) => action(client));
  client.conversation.upsert.mockResolvedValue({ id });
  client.conversation.findUnique.mockResolvedValue(thread);
  client.message.findUnique.mockResolvedValue(null);
  client.message.create.mockImplementation(async ({ data }: { data: object }) => ({ ...data, id: crypto.randomUUID(), createdAt: new Date(), readAt: null }));
  client.notification.create.mockResolvedValue({ id: crypto.randomUUID(), userId: user.id });
  client.outboxDedupeKey.createManyAndReturn.mockImplementation(async ({ data }: { data: object[] }) => data);
});

describe("official admin messages", () => {
  it("opens a retry-safe separate channel using the authenticated admin", async () => {
    const response = await request(createApp()).post(`/api/v1/admin/users/${user.id}/conversation`).set("Authorization", authorization()).send({}).expect(200);
    expect(response.body.data).toEqual({ conversation_id: id });
    expect(await openSystemConversation(admin, user.id)).toBe(id);
    expect(client.conversation.upsert).toHaveBeenCalledWith({ where: { systemKey: `${admin.id}:${user.id}` }, update: {},
      create: { systemKey: `${admin.id}:${user.id}`, buyerId: user.id, sellerId: admin.id }, select: { id: true } });
  });
  it.each(["USER", "LOCKED", "deleted", "unverified"])("rechecks the admin state inside the transaction: %s", async (state) => {
    client.$queryRaw.mockResolvedValue([{ ...admin, ...(state === "USER" ? { role: "USER" } : state === "LOCKED" ? { status: "LOCKED" } : state === "deleted" ? { deletedAt: new Date() } : { emailVerifiedAt: null }) }, user]);
    await expect(openSystemConversation(admin, user.id)).rejects.toBeDefined();
    expect(client.conversation.upsert).not.toHaveBeenCalled();
  });
  it.each([null, { ...user, role: "ADMIN" }, { ...user, status: "LOCKED" }, { ...user, deletedAt: new Date() }])("rejects unavailable or non-user recipients", async (recipient) => {
    client.$queryRaw.mockResolvedValue([admin, ...(recipient ? [recipient] : [])]);
    await expect(openSystemConversation(admin, user.id)).rejects.toBeDefined();
    expect(client.conversation.upsert).not.toHaveBeenCalled();
  });
  it("denies normal users and rejects sender/identity injection", async () => {
    client.session.findUnique.mockResolvedValue({ userId: user.id, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), user });
    await request(createApp()).post(`/api/v1/admin/users/${admin.id}/conversation`).set("Authorization", `Bearer ${signAccessToken(user.id, "session")}`).send({}).expect(403);
    await request(createApp()).post(`/api/v1/conversations/${id}/messages`).set("Authorization", `Bearer ${signAccessToken(user.id, "session")}`).send({ content: "Fake", client_message_id: "fake", is_system: true }).expect(422);
    expect(client.message.create).not.toHaveBeenCalled();
    expect(client.conversation.upsert).not.toHaveBeenCalled();
  });
  it("commits the real admin audit, official notification and realtime identity together", async () => {
    const delivered = vi.fn(), stop = onRealtimeEvent(delivered);
    try {
      const result = await sendChatMessage({ conversationId: id, viewer: admin, clientMessageId: "official", content: "Thông báo cho bạn" });
      expect(result.isSystem).toBe(true);
      expect(client.message.create).toHaveBeenCalledWith({ data: expect.objectContaining({ senderId: admin.id }) });
      expect(client.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: admin.id, targetUserId: user.id, action: "user.system_message" }) });
      expect(client.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: "Tin nhắn từ Hệ thống ReMarket", userId: user.id }) });
      expect(delivered).toHaveBeenCalledWith(expect.objectContaining({ eventType: "message.created", payload: expect.objectContaining({ message: expect.objectContaining({ is_system: true }) }) }));
      client.message.findUnique.mockResolvedValue(result.message);
      const retry = await sendChatMessage({ conversationId: id, viewer: admin, clientMessageId: "official", content: "Thông báo cho bạn" });
      expect(retry).toMatchObject({ created: false, isSystem: true });
      expect(client.message.create).toHaveBeenCalledOnce();
      expect(client.auditLog.create).toHaveBeenCalledOnce();
    } finally { stop(); }
  });
  it("does not label user replies as system messages", async () => {
    const result = await sendChatMessage({ conversationId: id, viewer: user, clientMessageId: "reply", content: "Tôi đã nhận được" });
    expect(result.isSystem).not.toBe(true);
    expect(client.auditLog.create).not.toHaveBeenCalled();
    expect(client.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ title: `Tin nhắn mới từ ${user.fullName}` }) });
  });
  it("displays the official identity only in official channels, including reloaded history", async () => {
    client.session.findUnique.mockResolvedValue({ userId: user.id, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), user });
    const token = `Bearer ${signAccessToken(user.id, "session")}`;
    const detail = await request(createApp()).get(`/api/v1/conversations/${id}`).set("Authorization", token).expect(200);
    expect(detail.body.data).toMatchObject({ is_system: true, can_send: true, counterparty: { name: "Hệ thống ReMarket", is_system: true, avatar_url: null } });
    client.message.findMany.mockResolvedValue([
      { id: crypto.randomUUID(), clientMessageId: "reply", senderId: user.id, content: "Reply", createdAt: new Date(), readAt: null },
      { id: crypto.randomUUID(), clientMessageId: "admin", senderId: admin.id, content: "Official", createdAt: new Date(), readAt: null },
    ]);
    const history = await request(createApp()).get(`/api/v1/conversations/${id}/messages`).set("Authorization", token).expect(200);
    expect(history.body.data.items.find((item: { sender_id: string }) => item.sender_id === admin.id).is_system).toBe(true);
    expect(history.body.data.items.find((item: { sender_id: string }) => item.sender_id === user.id).is_system).toBeUndefined();
    client.conversation.findUnique.mockResolvedValue({ ...thread, systemKey: null });
    const normal = await request(createApp()).get(`/api/v1/conversations/${id}`).set("Authorization", token).expect(200);
    expect(normal.body.data.counterparty.name).toBe(admin.fullName);
    expect(normal.body.data.is_system).toBeUndefined();
  });
  it("does not publish when audit persistence fails", async () => {
    client.auditLog.create.mockRejectedValue(new Error("Audit unavailable"));
    const delivered = vi.fn(), stop = onRealtimeEvent(delivered);
    try {
      await expect(sendChatMessage({ conversationId: id, viewer: admin, clientMessageId: "fail", content: "Official" })).rejects.toThrow("Audit unavailable");
      expect(delivered).not.toHaveBeenCalled();
      expect(client.notification.create).not.toHaveBeenCalled();
    } finally { stop(); }
  });
});
