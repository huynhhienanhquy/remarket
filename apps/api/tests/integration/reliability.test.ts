import { randomUUID } from "node:crypto";
import request from "supertest";
import { apiResponseIssue, validApiResponse } from "@remarket/shared";
import type { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { prisma } from "../../src/utils/prisma.js";
import { createOrderReminders } from "../../src/jobs/runner.js";
import { blockProduct } from "../../src/services/admin-moderation.js";
import { releaseReservedProducts } from "../../src/services/reservations.js";
import { enqueueOutbox, processOutboxBatch } from "../../src/outbox/outbox.js";
import { cleanupExpiredRecords } from "../../src/jobs/retention.js";
import { startRealtimeRelay } from "../../src/realtime/relay.js";
import { onRealtimeEvent } from "../../src/realtime/events.js";
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/shared/tokens.js";

function latch() {
  let resolve!: () => void;
  return { promise: new Promise<void>((done) => { resolve = done; }), resolve: () => resolve() };
}
const users: string[] = [], categories: string[] = [], events: string[] = [];
async function user(role: "USER" | "ADMIN" = "USER") {
  const id = randomUUID(); users.push(id);
  return prisma.user.create({ data: { id, email: `${id}@example.test`, fullName: "Reliability Test", role,
    passwordHash: "unused-in-this-test", emailVerifiedAt: new Date() } });
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("PostgreSQL reliability regressions", () => {
  afterAll(async () => {
    await prisma.outboxEvent.deleteMany({ where: { OR: [{ id: { in: events } }, ...users.map((id) => ({ payload: { path: ["recipients"], array_contains: [id] } }))] } });
    await prisma.product.updateMany({ where: { sellerId: { in: users } }, data: { reservedOrderId: null, status: "INACTIVE" } });
    await prisma.order.deleteMany({ where: { buyerId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.category.deleteMany({ where: { id: { in: categories } } });
    await prisma.$disconnect();
  });

  it("drains 51 reminder candidates in two batches and creates exactly one event per new notification", async () => {
    const buyer = await user(), seller = await user();
    const orders = Array.from({ length: 51 }, () => randomUUID());
    await prisma.order.createMany({ data: orders.map((id) => ({ id, code: `RM-${id}`, buyerId: buyer.id, sellerId: seller.id,
      status: "CONFIRMED" as const, deliveryMethod: "COD" as const, subtotal: "1", shippingFee: "0", totalAmount: "1",
      confirmedAt: new Date(Date.now() - 73 * 60 * 60 * 1000) })) });
    expect(await createOrderReminders()).toBe(50);
    expect(await createOrderReminders()).toBe(1);
    expect(await createOrderReminders()).toBe(0);
    const notifications = await prisma.notification.findMany({ where: { userId: seller.id, type: "ORDER_REMINDER" } });
    expect(notifications).toHaveLength(51);
    expect(await prisma.outboxEvent.count({ where: { aggregateId: { in: notifications.map((row) => row.id) }, eventType: "notification.created" } })).toBe(51);
  });

  it("lets buyer cancellation finish while moderation waits for its Order, without Product/Order inversion", async () => {
    const buyer = await user(), seller = await user(), admin = await user("ADMIN");
    const category = await prisma.category.create({ data: { name: "Reliability", slug: randomUUID(), status: "ACTIVE" } }); categories.push(category.id);
    const order = await prisma.order.create({ data: { code: `RM-${randomUUID()}`, buyerId: buyer.id, sellerId: seller.id,
      deliveryMethod: "COD", subtotal: "1", shippingFee: "0", totalAmount: "1" } });
    const product = await prisma.product.create({ data: { title: "Reliability", description: "Test", price: "1", condition: "GOOD",
      categoryId: category.id, provinceCode: "79", deliveryMethod: "COD", shippingFee: "0", sellerId: seller.id,
      status: "RESERVED", reservedOrderId: order.id } });
    await prisma.orderItem.create({ data: { orderId: order.id, productId: product.id, titleSnapshot: product.title,
      conditionSnapshot: "GOOD", price: "1", sortOrder: 0 } });
    const orderHeld = latch(), releaseCancel = latch(), moderationWaiting = latch();
    const cancel = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${buyer.id} FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;
      orderHeld.resolve(); await releaseCancel.promise;
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED", version: { increment: 1 } } });
      await releaseReservedProducts(tx, order.id);
    }, { timeout: 30_000 });
    await orderHeld.promise;
    const moderation = prisma.$transaction(async (tx) => {
      const wrapped = new Proxy(tx, { get(target, key) {
        if (key !== "$queryRaw") return Reflect.get(target, key);
        return (query: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
          const sql = "strings" in query ? query.strings.join("?") : query.join("?");
          if (sql.includes('FROM "Order"')) moderationWaiting.resolve();
          return target.$queryRaw(query, ...values);
        };
      } });
      await blockProduct(wrapped, { productId: product.id, reason: "Test", actor: { id: admin.id, fullName: admin.fullName } });
    }, { timeout: 30_000 });
    await moderationWaiting.promise;
    releaseCancel.resolve();
    await Promise.all([cancel, moderation]);
    expect(await prisma.product.findUnique({ where: { id: product.id } })).toMatchObject({ isBlocked: true, reservedOrderId: null });
    expect(await prisma.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "CANCELLED" });
  });

  it("does not let a later worker commit a sequence ahead of a delayed transaction", async () => {
    const a = randomUUID(), b = randomUUID(); events.push(a, b);
    await prisma.outboxEvent.createMany({ data: [a, b].map((id, index) => ({ id, aggregateId: id,
      dedupeKey: id, eventType: "order.updated", payload: {}, createdAt: new Date(index ? "1981-01-01" : "1980-01-01") })) });
    const assignedA = latch(), commitA = latch(), waitingB = latch();
    const delivered: string[] = [];
    const unsubscribe = onRealtimeEvent((event) => delivered.push(event.aggregateId));
    const stopRelay = await startRealtimeRelay(50, prisma);
    function wrappedClient(first: boolean): PrismaClient {
      return new Proxy(prisma, { get(target, key) {
        if (key !== "$transaction") {
          const value: unknown = Reflect.get(target, key);
          return typeof value === "function" ? value.bind(target) : value;
        }
        return (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(async (tx) => callback(new Proxy(tx, {
          get(transaction, field) {
            if (field === "$executeRaw") return async (query: TemplateStringsArray, ...values: unknown[]) => {
              const sql = query.join("?");
              if (!first && sql.includes("pg_advisory_xact_lock")) waitingB.resolve();
              const result = await transaction.$executeRaw(query, ...values);
              if (first && sql.includes('UPDATE "OutboxEvent"')) { assignedA.resolve(); await commitA.promise; }
              return result;
            };
            return Reflect.get(transaction, field);
          },
        })), { timeout: 30_000 });
      } });
    }
    try {
    const first = processOutboxBatch(() => undefined, 1, wrappedClient(true));
    await assignedA.promise;
    const second = processOutboxBatch(() => undefined, 1, wrappedClient(false));
    await waitingB.promise;
    expect(await prisma.outboxEvent.findMany({ where: { id: { in: [a, b] }, processedAt: { not: null } } })).toHaveLength(0);
    commitA.resolve(); await Promise.all([first, second]);
    const rows = await prisma.outboxEvent.findMany({ where: { id: { in: [a, b] } }, orderBy: { relaySequence: "asc" } });
    expect(rows.map((row) => row.id)).toEqual([a, b]);
    expect(rows.every((row) => row.relaySequence !== null)).toBe(true);
    await vi.waitFor(() => expect(delivered.filter((id) => id === a || id === b)).toEqual([a, b]), { timeout: 10_000 });
    } finally { commitA.resolve(); stopRelay(); unsubscribe(); }
  });

  it("retains active credentials and pending work while preserving dedupe after payload cleanup", async () => {
    const owner = await user();
    const old = new Date("2000-01-01"), future = new Date(Date.now() + 86400000);
    const expired = await prisma.session.create({ data: { userId: owner.id, expiresAt: old } });
    const active = await prisma.session.create({ data: { userId: owner.id, expiresAt: future } });
    const replay = await prisma.session.create({ data: { userId: owner.id, expiresAt: old, revokedAt: old } });
    await prisma.authToken.createMany({ data: [
      { userId: owner.id, sessionId: expired.id, purpose: "REFRESH", tokenHash: randomUUID(), expiresAt: old, consumedAt: old },
      { userId: owner.id, sessionId: active.id, purpose: "REFRESH", tokenHash: randomUUID(), expiresAt: future },
      { userId: owner.id, sessionId: replay.id, purpose: "REFRESH", tokenHash: randomUUID(), expiresAt: future, consumedAt: new Date() },
    ] });
    const processed = randomUUID(), pending = randomUUID(), deadLetter = randomUUID(); events.push(processed, pending, deadLetter);
    await prisma.outboxEvent.createMany({ data: [
      { id: processed, dedupeKey: processed, eventType: "order.updated", aggregateId: owner.id, payload: {}, processedAt: old },
      { id: pending, dedupeKey: pending, eventType: "order.updated", aggregateId: owner.id, payload: {}, createdAt: old },
      { id: deadLetter, dedupeKey: deadLetter, eventType: "order.updated", aggregateId: owner.id, payload: {}, createdAt: old, attempts: 10, lastError: "failed" },
    ] });
    await cleanupExpiredRecords(prisma);
    expect(await prisma.session.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma.session.count({ where: { id: { in: [active.id, replay.id] } } })).toBe(2);
    expect(await prisma.authToken.count({ where: { userId: owner.id } })).toBe(2);
    expect(await prisma.outboxEvent.count({ where: { id: { in: [pending, deadLetter] } } })).toBe(2);
    expect(await prisma.outboxEvent.findUnique({ where: { id: processed } })).toBeNull();
    await prisma.$transaction((tx) => enqueueOutbox(tx, "order.updated", owner.id, processed, { replay: true }));
    expect(await prisma.outboxEvent.findUnique({ where: { dedupeKey: processed } })).toBeNull();
    expect(await prisma.outboxDedupeKey.findUnique({ where: { dedupeKey: processed } })).not.toBeNull();
  });

  it("serializes concurrent additions at the cart limit and validates the actual response contract", async () => {
    const buyer = await user(), seller = await user();
    const categoryId = randomUUID(); categories.push(categoryId);
    await prisma.category.create({ data: { id: categoryId, name: "Cart test", slug: categoryId } });
    const productIds = Array.from({ length: 51 }, () => randomUUID());
    await prisma.product.createMany({ data: productIds.map((id) => ({ id, title: "Cart product", description: "Test",
      price: "100000", condition: "GOOD" as const, categoryId, provinceCode: "VN-01", deliveryMethod: "COD" as const,
      shippingFee: "30000", sellerId: seller.id, status: "ACTIVE" as const })) });
    await prisma.cartItem.createMany({ data: productIds.slice(0, 49).map((productId) => ({ userId: buyer.id, productId })) });
    const session = await prisma.session.create({ data: { userId: buyer.id, expiresAt: new Date(Date.now() + 300_000) } });
    const token = signAccessToken(buyer.id, session.id), app = createApp();
    const add = (productId: string) => request(app).post("/api/v1/cart/items").set("Authorization", `Bearer ${token}`).send({ product_id: productId });
    const results = await Promise.all(productIds.slice(49).map(add));
    expect(results.map((result) => result.status).sort()).toEqual([200, 422]);
    const success = results.find((result) => result.status === 200)!;
    expect(apiResponseIssue("/cart/items", "POST", 200, success.body)).toBeNull();
    expect(validApiResponse("/cart/items", "POST", 200, success.body)).toBe(true);
    expect(await prisma.cartItem.count({ where: { userId: buyer.id } })).toBe(50);
    expect((await add(productIds[0]!)).status).toBe(200);
  });
});
