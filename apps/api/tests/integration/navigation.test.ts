import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { disconnectDatabaseClient } from "../../src/utils/database-client.js";
import { backgroundPrisma } from "../../src/utils/background-prisma.js";
import { signAccessToken } from "../../src/shared/tokens.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const app = createApp();
const viewer = randomUUID(), seller = randomUUID(), outsider = randomUUID(), category = randomUUID(), product = randomUUID();
const users = [viewer, seller, outsider];

describe.skipIf(!enabled)("navigation counts on PostgreSQL", () => {
  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: product } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.category.deleteMany({ where: { id: category } });
    await Promise.all([disconnectDatabaseClient(prisma), disconnectDatabaseClient(backgroundPrisma)]);
  });

  it("matches legacy counts, excludes private/outgoing/read messages and rechecks changed state", async () => {
    await prisma.user.createMany({ data: users.map((id) => ({
      id, fullName: "Navigation test", email: `${id}@example.test`, passwordHash: "test-only", emailVerifiedAt: new Date(),
    })) });
    await prisma.category.create({ data: { id: category, name: "Navigation", slug: category } });
    await prisma.product.create({ data: {
      id: product, sellerId: seller, categoryId: category, title: "Counted cart item", description: "Fixture",
      price: "100000", condition: "GOOD", provinceCode: "VN-01", deliveryMethod: "MEETUP", shippingFee: "0", status: "ACTIVE",
    } });
    await prisma.cartItem.create({ data: { userId: viewer, productId: product } });
    await prisma.notification.createMany({ data: [
      { userId: viewer, type: "NEW_MESSAGE", title: "Unread", content: "Fixture", referenceType: "conversation" },
      { userId: viewer, type: "NEW_MESSAGE", title: "Read", content: "Fixture", referenceType: "conversation", readAt: new Date() },
      { userId: outsider, type: "NEW_MESSAGE", title: "Private", content: "Fixture", referenceType: "conversation" },
    ] });
    const incoming = await prisma.conversation.create({ data: { buyerId: viewer, sellerId: seller } });
    const privateThread = await prisma.conversation.create({ data: { buyerId: outsider, sellerId: seller } });
    await prisma.message.createMany({ data: [
      { conversationId: incoming.id, senderId: seller, clientMessageId: randomUUID(), content: "Incoming" },
      { conversationId: incoming.id, senderId: viewer, clientMessageId: randomUUID(), content: "Outgoing" },
      { conversationId: incoming.id, senderId: seller, clientMessageId: randomUUID(), content: "Read", readAt: new Date() },
      { conversationId: privateThread.id, senderId: seller, clientMessageId: randomUUID(), content: "Private" },
    ] });
    const session = await prisma.session.create({ data: { userId: viewer, expiresAt: new Date(Date.now() + 600_000) } });
    const token = `Bearer ${signAccessToken(viewer, session.id)}`;
    const get = (path: string) => request(app).get(`/api/v1${path}`).set("Authorization", token);
    await request(app).get("/api/v1/notifications/navigation-counts").expect(401);
    const compact = await get("/notifications/navigation-counts").expect(200);
    expect(compact.body.data).toEqual({ messages: 1, notifications: 1, cart: 1 });
    expect(compact.headers["cache-control"]).toBe("no-store");
    const [messages, notifications, cart] = await Promise.all([
      get("/conversations/unread-count").expect(200), get("/notifications/unread-count").expect(200), get("/cart").expect(200),
    ]);
    expect(compact.body.data).toEqual({ messages: messages.body.data, notifications: notifications.body.data, cart: cart.body.data.total_items });
    await prisma.message.updateMany({ where: { conversationId: incoming.id }, data: { readAt: new Date() } });
    await prisma.cartItem.deleteMany({ where: { userId: viewer } });
    expect((await get("/notifications/navigation-counts").expect(200)).body.data).toEqual({ messages: 0, notifications: 1, cart: 0 });
    await prisma.cartItem.create({ data: { userId: viewer, productId: product } });
    await prisma.user.update({ where: { id: viewer }, data: { status: "LOCKED" } });
    expect((await get("/notifications/navigation-counts").expect(200)).body.data).toEqual({ messages: 0, notifications: 1, cart: 0 });
    await get("/cart").expect(403);
    await get("/conversations/unread-count").expect(403);
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await get("/notifications/navigation-counts").expect(401);
  }, 120_000);

  it("keeps profile visibility and category checks fresh after parallelizing reads", async () => {
    const path = `/api/v1/users/${seller}`;
    await request(app).get(path).expect(200);
    expect((await request(app).get(`${path}/products`).expect(200)).body.data.meta.total).toBe(1);
    await prisma.category.update({ where: { id: category }, data: { status: "INACTIVE" } });
    expect((await request(app).get(`${path}/products`).expect(200)).body.data.meta.total).toBe(0);
    await prisma.user.update({ where: { id: seller }, data: { status: "LOCKED" } });
    await request(app).get(path).expect(404);
    await request(app).get(`${path}/products`).expect(404);
  }, 120_000);
});
