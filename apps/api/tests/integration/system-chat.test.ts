import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { backgroundPrisma } from "../../src/utils/background-prisma.js";
import { disconnectDatabaseClient } from "../../src/utils/database-client.js";
import { signAccessToken } from "../../src/shared/tokens.js";
import { onRealtimeEvent } from "../../src/realtime/events.js";

describe.skipIf(!process.env.TEST_DATABASE_URL)("official admin-user chat on PostgreSQL", () => {
  const app = createApp();
  afterAll(async () => {
    // The dedicated harness owns and removes the whole temporary schema.
    await Promise.all([disconnectDatabaseClient(prisma), disconnectDatabaseClient(backgroundPrisma)]);
  });
  it("isolates official channels, delivers as system, allows replies, deduplicates and preserves read state", async () => {
    expect(new URL(process.env.TEST_DATABASE_URL!).searchParams.get("schema")).toMatch(/^remarket_verify_[a-f0-9]{32}$/);
    const adminId = randomUUID(), userId = randomUUID(), outsiderId = randomUUID();
    await prisma.user.createMany({ data: [adminId, userId, outsiderId].map((id) => ({
      id, fullName: id === adminId ? "Private admin identity" : "Test user", email: `${id}@example.test`,
      passwordHash: "unused-test-hash", role: id === adminId ? "ADMIN" : "USER", emailVerifiedAt: new Date(),
    })) });
    async function auth(id: string) {
      const session = await prisma.session.create({ data: { userId: id, expiresAt: new Date(Date.now() + 600_000) } });
      return `Bearer ${signAccessToken(id, session.id)}`;
    }
    const adminToken = await auth(adminId), userToken = await auth(userId), outsiderToken = await auth(outsiderId);
    await request(app).post(`/api/v1/admin/users/${userId}/conversation`).set("Authorization", userToken).send({}).expect(403);
    const [first, retryOpen] = await Promise.all([0, 1].map(() => request(app).post(`/api/v1/admin/users/${userId}/conversation`).set("Authorization", adminToken).send({}).expect(200)));
    const conversationId = first!.body.data.conversation_id as string;
    expect(retryOpen!.body.data.conversation_id).toBe(conversationId);
    expect(await prisma.conversation.count({ where: { systemKey: `${adminId}:${userId}` } })).toBe(1);
    const legacy = await prisma.conversation.create({ data: { buyerId: userId, sellerId: adminId } });
    const legacyView = await request(app).get(`/api/v1/conversations/${legacy.id}`).set("Authorization", userToken).expect(200);
    expect(legacyView.body.data.is_system).toBeUndefined();
    expect(legacyView.body.data.counterparty.name).toBe("Private admin identity");
    const delivered = vi.fn(), stop = onRealtimeEvent(delivered);
    const payload = { content: "Thông báo từ quản trị viên", client_message_id: randomUUID() };
    try {
      const sent = await request(app).post(`/api/v1/conversations/${conversationId}/messages`).set("Authorization", adminToken).send(payload).expect(201);
      expect(sent.body.data.message).toMatchObject({ sender_id: adminId, is_system: true, content: payload.content });
      const repeated = await request(app).post(`/api/v1/conversations/${conversationId}/messages`).set("Authorization", adminToken).send(payload).expect(200);
      expect(repeated.body.data.message.id).toBe(sent.body.data.message.id);
      expect(await prisma.message.count({ where: { conversationId } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { actorId: adminId, targetUserId: userId, action: "user.system_message" } })).toBe(1);
      const notification = await prisma.notification.findFirstOrThrow({ where: { userId, referenceId: conversationId } });
      expect(notification.title).toBe("Tin nhắn từ Hệ thống ReMarket");
      expect(delivered.mock.calls.filter(([event]) => event.eventType === "message.created")).toHaveLength(1);
      expect(delivered.mock.calls.find(([event]) => event.eventType === "message.created")![0].payload.message.is_system).toBe(true);
      const durable = await prisma.outboxEvent.findFirstOrThrow({ where: { dedupeKey: `message:${sent.body.data.message.id}` } });
      expect(durable.payload).toMatchObject({ recipient_id: userId, message: { is_system: true } });
      const inbox = await request(app).get("/api/v1/conversations").set("Authorization", userToken).expect(200);
      expect(inbox.body.data.items.find((item: { id: string }) => item.id === conversationId)).toMatchObject({
        is_system: true, unread_count: 1, can_send: true, counterparty: { name: "Hệ thống ReMarket", is_system: true, avatar_url: null },
      });
      await request(app).get(`/api/v1/conversations/${conversationId}`).set("Authorization", outsiderToken).expect(404);
      await request(app).post(`/api/v1/conversations/${conversationId}/messages`).set("Authorization", userToken).send({ ...payload, is_system: true }).expect(422);
      const read = await request(app).post(`/api/v1/conversations/${conversationId}/read`).set("Authorization", userToken).send({ last_message_id: sent.body.data.message.id }).expect(200);
      expect(read.body.data.unread).toBe(0);
      const reply = await request(app).post(`/api/v1/conversations/${conversationId}/messages`).set("Authorization", userToken).send({ content: "Tôi đã nhận được", client_message_id: randomUUID() }).expect(201);
      expect(reply.body.data.message.is_system).toBeUndefined();
      const history = await request(app).get(`/api/v1/conversations/${conversationId}/messages`).set("Authorization", userToken).expect(200);
      expect(history.body.data.items).toHaveLength(2);
      expect(history.body.data.items[0]).toMatchObject({ is_system: true, sender_id: adminId, read_at: expect.any(String) });
      expect(history.body.data.items[1].is_system).toBeUndefined();
      const adminView = await request(app).get(`/api/v1/conversations/${conversationId}`).set("Authorization", adminToken).expect(200);
      expect(adminView.body.data).toMatchObject({ is_system: true, unread_count: 1, counterparty: { id: userId, name: "Test user" } });
      expect(adminView.body.data.counterparty.is_system).toBeUndefined();
    } finally { stop(); }
  }, 120_000);
});
