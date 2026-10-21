import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { signAccessToken } from "../../src/shared/tokens.js";
import { blockProduct, lockUser } from "../../src/services/admin-moderation.js";

const app = createApp();
const users: string[] = [], categories: string[] = [];
const password = "regression-password-2026";
async function account(role: "USER" | "ADMIN" = "USER") {
  const id = randomUUID(); users.push(id);
  const user = await prisma.user.create({ data: {
    id, email: `${id}@example.test`, fullName: `Private name ${id}`, role,
    emailVerifiedAt: new Date(), passwordHash: await bcrypt.hash(password, 4),
  } });
  const session = await prisma.session.create({ data: { userId: id, expiresAt: new Date(Date.now() + 3600_000) } });
  return { user, authorization: `Bearer ${signAccessToken(id, session.id)}` };
}
async function sale(status: "PENDING" | "CONFIRMED" | "SHIPPING" | "DELIVERED" | "CANCELLED" = "PENDING") {
  const buyer = await account(), seller = await account();
  const category = await prisma.category.create({ data: { name: "Bug regression", slug: randomUUID() } });
  categories.push(category.id);
  const order = await prisma.order.create({ data: {
    code: `RM-${randomUUID()}`, buyerId: buyer.user.id, sellerId: seller.user.id, status,
    deliveryMethod: "MEETUP", subtotal: "1000", shippingFee: "0", totalAmount: "1000",
    expiresAt: new Date(Date.now() + 3600_000),
  } });
  const product = await prisma.product.create({ data: {
    title: "Regression product", description: "Regression product description", price: "1000", shippingFee: "0", condition: "GOOD",
    categoryId: category.id, provinceCode: "VN-01", deliveryMethod: "MEETUP", sellerId: seller.user.id,
    status: "RESERVED", reservedOrderId: order.id,
  } });
  await prisma.orderItem.create({ data: {
    orderId: order.id, productId: product.id, titleSnapshot: product.title, conditionSnapshot: "GOOD", price: "1000", sortOrder: 0,
  } });
  return { buyer, seller, category, order, product };
}

describe.skipIf(!process.env.TEST_DATABASE_URL)("reported privacy and order regressions", () => {
  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.product.updateMany({ where: { sellerId: { in: users } }, data: { reservedOrderId: null, status: "INACTIVE" } });
    await prisma.order.deleteMany({ where: { buyerId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.category.deleteMany({ where: { id: { in: categories } } });
    await prisma.$disconnect();
  });

  it("scrubs the deleted account's name in history while preserving the other participant's name", async () => {
    const { buyer, seller, order } = await sale("CANCELLED");
    await prisma.orderStatusHistory.createMany({ data: [buyer, seller].map(({ user }) => ({
      orderId: order.id, fromStatus: "PENDING", toStatus: "CANCELLED", actorType: "USER", actorId: user.id, actorName: user.fullName,
    })) });
    await request(app).post("/api/v1/mobile/delete-account").set("Authorization", buyer.authorization).send({ password }).expect(200);
    const response = await request(app).get(`/api/v1/orders/${order.id}`).set("Authorization", seller.authorization).expect(200);
    expect(JSON.stringify(response.body.data)).not.toContain(buyer.user.fullName);
    expect(JSON.stringify(response.body.data.status_history)).toContain(seller.user.fullName);
    expect(await prisma.orderStatusHistory.findFirst({ where: { orderId: order.id, actorId: buyer.user.id } }))
      .toMatchObject({ actorName: "Người dùng đã xóa", actorId: buyer.user.id });
  });

  it.each(["create", "reply"])("rejects an authenticated support %s that resumes after deletion", async (operation) => {
    const owner = await account();
    const ticket = await prisma.supportTicket.create({ data: {
      code: `TK-${randomUUID()}`, userId: owner.user.id, type: "ACCOUNT", subject: "Old subject", status: "RESOLVED",
    } });
    let entered!: () => void, resume!: () => void;
    const waiting = new Promise<void>((done) => { entered = done; });
    const gate = new Promise<void>((done) => { resume = done; });
    const original = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (input, options) => {
      entered(); await gate;
      return Reflect.apply(original, prisma, [input, options]);
    });
    const path = operation === "create" ? "/api/v1/support/tickets" : `/api/v1/support/tickets/${ticket.id}/messages`;
    const payload = operation === "create"
      ? { type: "ACCOUNT", subject: "New private subject", message: "Private pending content" }
      : { message: "Private pending content" };
    const pending = request(app).post(path).set("Authorization", owner.authorization).send(payload).then((response) => response);
    try {
      await waiting;
      await request(app).post("/api/v1/mobile/delete-account").set("Authorization", owner.authorization).send({ password }).expect(200);
      resume();
      expect((await pending).status).toBe(401);
      expect(await prisma.supportMessage.count({ where: { senderId: owner.user.id, message: "Private pending content" } })).toBe(0);
      expect(await prisma.supportTicket.count({ where: { userId: owner.user.id } })).toBe(1);
      expect(await prisma.supportTicket.findUnique({ where: { id: ticket.id } })).toMatchObject({ status: "RESOLVED" });
    } finally { resume(); spy.mockRestore(); await pending; }
  });

  it("preserves support access for a locked account that has not been deleted", async () => {
    const owner = await account();
    await prisma.user.update({ where: { id: owner.user.id }, data: { status: "LOCKED" } });
    await request(app).post("/api/v1/support/tickets").set("Authorization", owner.authorization)
      .send({ type: "ACCOUNT", subject: "Help with locked account", message: "Please review my account." }).expect(201);
  });

  it.each(["CLOSED", "RESOLVED"] as const)("reopens a %s product incident and blocks completion", async (status) => {
    const { buyer, order, product } = await sale("DELIVERED");
    const admin = await account("ADMIN");
    const ticket = await prisma.supportTicket.create({ data: {
      code: `SYS-${order.code}-PRODUCT`, orderId: order.id, userId: buyer.user.id,
      type: "ORDER_PROBLEM", subject: "Previous incident", status, resolutionNote: "Old resolution", resolvedAt: new Date(), closedAt: new Date(),
    } });
    await prisma.$transaction((tx) => blockProduct(tx, { productId: product.id, reason: "New incident", actor: admin.user }));
    expect(await prisma.supportTicket.findUnique({ where: { id: ticket.id } }))
      .toMatchObject({ status: "OPEN", resolutionNote: null, resolvedAt: null, closedAt: null });
    await request(app).post(`/api/v1/orders/${order.id}/actions`).set("Authorization", buyer.authorization)
      .send({ action: "complete", expected_version: order.version, buyer_confirmed_received: true, buyer_confirmed_paid: true }).expect(409);
    expect(await prisma.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "DELIVERED" });
  });

  it("reopens a closed account-lock incident when another account in the order is locked", async () => {
    const { buyer, seller, order } = await sale("SHIPPING");
    const admin = await account("ADMIN");
    const ticket = await prisma.supportTicket.create({ data: {
      code: `SYS-${order.code}-LOCK`, orderId: order.id, userId: buyer.user.id,
      type: "ORDER_PROBLEM", subject: "Previous incident", status: "CLOSED", resolutionNote: "Old resolution", resolvedAt: new Date(), closedAt: new Date(),
    } });
    await prisma.$transaction((tx) => lockUser(tx, { userId: seller.user.id, reason: "New lock", actor: admin.user }));
    expect(await prisma.supportTicket.findUnique({ where: { id: ticket.id } }))
      .toMatchObject({ status: "OPEN", resolutionNote: null, resolvedAt: null, closedAt: null });
  });

  it("offers and executes buyer cancellation for a confirmed meetup", async () => {
    const { buyer, order, product } = await sale("CONFIRMED");
    const response = await request(app).get(`/api/v1/orders/${order.id}`).set("Authorization", buyer.authorization).expect(200);
    expect(response.body.data.allowed_actions).toEqual(expect.arrayContaining(["cancel", "deliver"]));
    await request(app).post(`/api/v1/orders/${order.id}/actions`).set("Authorization", buyer.authorization)
      .send({ action: "cancel", expected_version: order.version, reason: "Không thể gặp mặt" }).expect(200);
    expect(await prisma.product.findUnique({ where: { id: product.id } })).toMatchObject({ status: "ACTIVE", reservedOrderId: null });
  });

  it.each([false, true])("commits cancellation and releases stock when category is inactive (ancestor=%s)", async (ancestor) => {
    const { seller, category, order, product } = await sale();
    const activeCategory = await prisma.category.create({ data: { name: "Still active", slug: randomUUID() } });
    categories.push(activeCategory.id);
    const otherProduct = await prisma.product.create({ data: {
      title: "Other reserved product", description: "Other reserved product description", price: "1000", shippingFee: "0", condition: "GOOD",
      categoryId: activeCategory.id, provinceCode: "VN-01", deliveryMethod: "MEETUP", sellerId: seller.user.id,
      status: "RESERVED", reservedOrderId: order.id,
    } });
    await prisma.orderItem.create({ data: {
      orderId: order.id, productId: otherProduct.id, titleSnapshot: otherProduct.title, conditionSnapshot: "GOOD", price: "1000", sortOrder: 1,
    } });
    if (ancestor) {
      const parent = await prisma.category.create({ data: { name: "Disabled parent", slug: randomUUID(), status: "INACTIVE" } });
      categories.push(parent.id);
      await prisma.category.update({ where: { id: category.id }, data: { parentId: parent.id } });
    } else await prisma.category.update({ where: { id: category.id }, data: { status: "INACTIVE" } });
    const response = await request(app).post(`/api/v1/orders/${order.id}/actions`).set("Authorization", seller.authorization)
      .send({ action: "confirm", expected_version: order.version }).expect(409);
    expect(response.body.error.code).toBe("PRODUCT_NOT_AVAILABLE");
    expect(await prisma.order.findUnique({ where: { id: order.id } })).toMatchObject({ status: "CANCELLED", version: order.version + 1 });
    expect(await prisma.product.findUnique({ where: { id: product.id } })).toMatchObject({ status: "INACTIVE", reservedOrderId: null });
    expect(await prisma.product.findUnique({ where: { id: otherProduct.id } })).toMatchObject({ status: "ACTIVE", reservedOrderId: null });
    expect(await prisma.orderStatusHistory.count({ where: { orderId: order.id, toStatus: "CANCELLED" } })).toBe(1);
    expect(await prisma.notification.count({ where: { referenceId: order.id, type: "ORDER_CANCELLED" } })).toBe(2);
  });

  it("does not cancel an unavailable order based on a stale confirmation version", async () => {
    const { seller, category, order, product } = await sale();
    await prisma.category.update({ where: { id: category.id }, data: { status: "INACTIVE" } });
    await prisma.order.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
    const response = await request(app).post(`/api/v1/orders/${order.id}/actions`).set("Authorization", seller.authorization)
      .send({ action: "confirm", expected_version: order.version }).expect(409);
    expect(response.body.error.code).toBe("VERSION_CONFLICT");
    expect(await prisma.product.findUnique({ where: { id: product.id } })).toMatchObject({ reservedOrderId: order.id });
  });
});
