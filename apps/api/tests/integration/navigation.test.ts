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
    await prisma.productImage.createMany({ data: [
      { productId: product, url: "https://example.test/second.jpg", sortOrder: 1 },
      { productId: product, url: "https://example.test/first.jpg", sortOrder: 0 },
    ] });
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
    expect(cart.body.data.groups[0].items[0]).toMatchObject({
      product_id: product, price: "100000", image_url: "https://example.test/first.jpg", available: true,
    });
    await prisma.product.update({ where: { id: product }, data: { isBlocked: true } });
    expect((await get("/cart").expect(200)).body.data.groups[0].items[0]).toMatchObject({
      product_id: product, title: "", price: "0", shipping_fee: "0", image_url: null, available: false,
    });
    await prisma.product.update({ where: { id: product }, data: { isBlocked: false } });
    await prisma.message.updateMany({ where: { conversationId: incoming.id }, data: { readAt: new Date() } });
    await prisma.cartItem.deleteMany({ where: { userId: viewer } });
    expect((await get("/cart").expect(200)).body.data).toEqual({ groups: [], total_items: 0 });
    expect((await get("/notifications/navigation-counts").expect(200)).body.data).toEqual({ messages: 0, notifications: 1, cart: 0 });
    await prisma.cartItem.create({ data: { userId: viewer, productId: product } });
    await prisma.user.update({ where: { id: viewer }, data: { status: "LOCKED" } });
    expect((await get("/notifications/navigation-counts").expect(200)).body.data).toEqual({ messages: 0, notifications: 1, cart: 0 });
    await get("/cart").expect(403);
    await get("/conversations/unread-count").expect(403);
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
    await get("/notifications/navigation-counts").expect(401);
  }, 120_000);

  it("puts unread notifications first across pages and moves read items below them", async () => {
    const userId = randomUUID();
    const oldestUnread = randomUUID();
    const newestUnread = randomUUID();
    const newestRead = randomUUID();
    try {
      await prisma.user.create({ data: {
        id: userId, email: `${userId}@example.test`, fullName: "Notification order test", passwordHash: "test-only",
      } });
      const notification = { userId, type: "NEW_MESSAGE" as const, title: "Order test", content: "Fixture", referenceType: "conversation" };
      await prisma.notification.createMany({ data: [
        { ...notification, id: oldestUnread, createdAt: new Date("2026-01-01") },
        { ...notification, id: newestUnread, createdAt: new Date("2026-01-02") },
        { ...notification, id: newestRead, createdAt: new Date("2026-01-03"), readAt: new Date("2026-01-03") },
      ] });
      const session = await prisma.session.create({ data: { userId, expiresAt: new Date(Date.now() + 600_000) } });
      const token = `Bearer ${signAccessToken(userId, session.id)}`;
      const list = (query: string) => request(app).get(`/api/v1/notifications?${query}`).set("Authorization", token).expect(200);

      const first = await list("page_size=1");
      expect(first.body.data.items.map(({ id }: { id: string }) => id)).toEqual([newestUnread]);
      expect(first.body.data.meta).toMatchObject({ total: 3, unread: 2 });
      expect((await list("page=2&page_size=1")).body.data.items[0].id).toBe(oldestUnread);

      await request(app).post(`/api/v1/notifications/${newestUnread}/read`).set("Authorization", token).expect(200);
      const reordered = await list("type=NEW_MESSAGE");
      expect(reordered.body.data.items.map(({ id }: { id: string }) => id)).toEqual([oldestUnread, newestRead, newestUnread]);
      expect(reordered.body.data.meta).toMatchObject({ total: 3, unread: 1 });
      expect((await list("unread=true&type=NEW_MESSAGE")).body.data.items.map(({ id }: { id: string }) => id)).toEqual([oldestUnread]);
      expect((await list("unread=true&type=NEW_MESSAGE&page_size=1&page=2")).body.data).toEqual({
        items: [], meta: { page: 2, page_size: 1, total: 1, total_pages: 1, unread: 1 },
      });
    } finally {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  });

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

  it("matches the four admin queue filters and reflects changes on the next read", async () => {
    const adminId = randomUUID();
    const categoryId = randomUUID();
    const productId = randomUUID();
    try {
      await prisma.user.create({ data: {
        id: adminId, fullName: "Admin navigation test", email: `${adminId}@example.test`,
        passwordHash: "test-only", role: "ADMIN", emailVerificationRequestedAt: new Date(),
      } });
      await prisma.category.create({ data: { id: categoryId, name: "Admin navigation", slug: categoryId } });
      await prisma.product.create({ data: {
        id: productId, sellerId: adminId, categoryId, title: "Pending badge listing", description: "Fixture",
        price: "100000", condition: "GOOD", provinceCode: "VN-01", deliveryMethod: "MEETUP", shippingFee: "0", status: "PENDING",
      } });
      const report = await prisma.report.create({ data: {
        reporterId: adminId, targetType: "product", targetId: productId, targetProductId: productId,
        targetLabel: "Fixture", reason: "SPAM",
      } });
      const ticket = await prisma.supportTicket.create({ data: {
        userId: adminId, code: adminId, subject: "Fixture", type: "OTHER",
      } });
      const session = await prisma.session.create({ data: { userId: adminId, expiresAt: new Date(Date.now() + 60_000) } });
      const read = async () => {
        const response = await request(app).get("/api/v1/admin/navigation-counts")
          .set("Authorization", `Bearer ${signAccessToken(adminId, session.id)}`).expect(200);
        return response.body.data;
      };

      const before = await read();
      const [emails, reports, tickets, products] = await Promise.all([
        prisma.user.count({ where: { emailVerificationRequestedAt: { not: null }, emailVerifiedAt: null } }),
        prisma.report.count({ where: { status: "PENDING" } }),
        prisma.supportTicket.count({ where: { status: "OPEN" } }),
        prisma.product.count({ where: { status: "PENDING", deletedAt: null } }),
      ]);
      expect(before).toEqual({ pending_email_verifications: emails, pending_reports: reports, open_tickets: tickets, pending_products: products });

      await prisma.$transaction([
        prisma.user.update({ where: { id: adminId }, data: { emailVerifiedAt: new Date() } }),
        prisma.report.update({ where: { id: report.id }, data: { status: "RESOLVED" } }),
        prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "IN_PROGRESS" } }),
        prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } }),
      ]);
      expect(await read()).toEqual({ pending_email_verifications: emails - 1, pending_reports: reports - 1, open_tickets: tickets - 1, pending_products: products - 1 });
    } finally {
      await prisma.report.deleteMany({ where: { reporterId: adminId } });
      await prisma.product.deleteMany({ where: { id: productId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.user.deleteMany({ where: { id: adminId } });
    }
  });
});
