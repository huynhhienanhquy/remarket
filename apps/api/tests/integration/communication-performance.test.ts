import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/utils/prisma.js";
import { backgroundPrisma } from "../../src/utils/background-prisma.js";
import { disconnectDatabaseClient } from "../../src/utils/database-client.js";
import { processOutboxBatch, processRealtimeOutboxBatch } from "../../src/outbox/outbox.js";
import { sendChatMessage } from "../../src/services/chat-service.js";
import { onRealtimeEvent } from "../../src/realtime/events.js";
import { startRealtimeRelay } from "../../src/realtime/relay.js";

const users: string[] = [], events: string[] = [];
describe.skipIf(!process.env.TEST_DATABASE_URL)("communication performance on PostgreSQL", () => {
  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: events } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await Promise.all([disconnectDatabaseClient(prisma), disconnectDatabaseClient(backgroundPrisma)]);
  });

  it("batches realtime work while leaving external, delayed, leased and dead events untouched", async () => {
    // An isolated schema is mandatory: the batch processor consumes its queue.
    expect(new URL(process.env.TEST_DATABASE_URL!).searchParams.get("schema")).toMatch(/^remarket_verify_/);
    const batch = async (eventType: string, size: number, extra = {}) => {
      const ids = Array.from({ length: size }, () => randomUUID()); events.push(...ids);
      await prisma.outboxEvent.createMany({ data: ids.map((id) => ({ id, eventType, aggregateId: id, dedupeKey: id, payload: {}, createdAt: new Date("1970-01-01"), ...extra })) });
      return ids;
    };
    const legacy = await batch("message.created", 8);
    const before = performance.now();
    expect(await processOutboxBatch(() => undefined, 8, prisma)).toBe(8);
    const legacyMs = performance.now() - before;
    const realtime = await batch("message.created", 8);
    const untouched = [
      ...await batch("email.auth", 1), ...await batch("storage.delete", 1),
      ...await batch("message.created", 1, { nextAttemptAt: new Date(Date.now() + 86_400_000) }),
      ...await batch("message.created", 1, { lockedAt: new Date(), lockId: "other-worker" }),
      ...await batch("message.created", 1, { attempts: 10 }),
    ];
    const after = performance.now();
    expect(await processRealtimeOutboxBatch(prisma, 8)).toBe(8);
    const batchMs = performance.now() - after;
    const processed = await prisma.outboxEvent.findMany({ where: { id: { in: realtime } } });
    expect(processed.every((row) => row.processedAt && row.relaySequence)).toBe(true);
    expect(new Set(processed.map((row) => row.relaySequence)).size).toBe(8);
    expect(await prisma.outboxEvent.count({ where: { id: { in: untouched }, processedAt: null } })).toBe(5);
    expect(await prisma.outboxEvent.count({ where: { id: { in: legacy }, processedAt: { not: null } } })).toBe(8);
    await mkdir("../../.artifacts/performance", { recursive: true });
    await writeFile("../../.artifacts/performance/communication-batch.json", JSON.stringify({ events: 8, legacyMs, batchMs }, null, 2));
    console.info("Outbox timing (8 events, one sample per path):", { legacyMs, batchMs });
  }, 120_000);

  it("publishes committed HTTP-service messages immediately and recovers through the relay without duplicate delivery", async () => {
    const buyerId = randomUUID(), sellerId = randomUUID(); users.push(buyerId, sellerId);
    await prisma.user.createMany({ data: users.map((id) => ({ id, fullName: "Communication test", email: `${id}@example.test`,
      passwordHash: "unused", emailVerifiedAt: new Date() })) });
    const conversation = await prisma.conversation.create({ data: { buyerId, sellerId } });
    const viewer = (await prisma.user.findUniqueOrThrow({ where: { id: buyerId } }));
    const delivered = vi.fn();
    const stopListener = onRealtimeEvent(delivered);
    const stopRelay = await startRealtimeRelay(50, backgroundPrisma);
    try {
      const result = await sendChatMessage({ conversationId: conversation.id, viewer, clientMessageId: randomUUID(), content: "Immediate committed message" });
      const eventRows = await prisma.outboxEvent.findMany({ where: { OR: [
        { dedupeKey: `message:${result.message.id}` }, { payload: { path: ["reference_id"], equals: conversation.id } },
      ] } });
      events.push(...eventRows.map((row) => row.id));
      expect(delivered.mock.calls.filter(([event]) => event.eventType === "message.created")).toHaveLength(1);
      await vi.waitFor(async () => {
        expect(await prisma.outboxEvent.count({ where: { id: { in: eventRows.map((row) => row.id) }, processedAt: null } })).toBe(0);
      }, { timeout: 15_000, interval: 100 });
      expect(delivered.mock.calls.filter(([event]) => event.eventType === "message.created")).toHaveLength(1);
      expect(delivered.mock.calls.filter(([event]) => event.eventType === "notification.created")).toHaveLength(1);
      const duplicate = await sendChatMessage({ conversationId: conversation.id, viewer, clientMessageId: result.message.clientMessageId, content: result.message.content });
      expect(duplicate.created).toBe(false);
      expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(1);
      await prisma.userBlock.create({ data: { blockerId: sellerId, blockedId: buyerId } });
      await expect(sendChatMessage({ conversationId: conversation.id, viewer, clientMessageId: randomUUID(), content: "Blocked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await prisma.message.count({ where: { conversationId: conversation.id } })).toBe(1);
    } finally { stopRelay(); stopListener(); }
  }, 120_000);
});
