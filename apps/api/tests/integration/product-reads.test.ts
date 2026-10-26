import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { backgroundPrisma } from "../../src/utils/background-prisma.js";
import { disconnectDatabaseClient } from "../../src/utils/database-client.js";
import { signAccessToken } from "../../src/shared/tokens.js";
import { ANONYMOUS_VIEWER } from "../../src/shared/dto-mappers.js";
import { readProducts } from "../../src/shared/product-reads.js";

const app = createApp();
const seller = randomUUID(), buyer = randomUUID(), admin = randomUUID(), root = randomUUID(), leaf = randomUUID();
const order = randomUUID(), reservedOrder = randomUUID();
const statuses = ["ACTIVE", "RESERVED", "SOLD", "PENDING", "REJECTED", "INACTIVE", "ACTIVE", "INACTIVE"] as const;
const ids = statuses.map(() => randomUUID());
const image = randomUUID(), imageTime = new Date("2026-10-01T12:34:56.789Z");
const storagePath = `users/${seller}/product/${image}.png`;
const tokens = new Map<string, string>();
const get = (path: string, user?: string) => {
  const pending = request(app).get(`/api/v1${path}`);
  return user ? pending.set("Authorization", tokens.get(user)!) : pending;
};

describe.skipIf(!process.env.TEST_DATABASE_URL)("product navigation snapshots on PostgreSQL", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [seller, buyer, admin].map((id) => ({
      id, fullName: "Snapshot seller", email: `${id}@example.test`, passwordHash: "private-test-hash",
      phone: "private-phone", defaultAddress: "private-address", role: id === admin ? "ADMIN" : "USER", emailVerifiedAt: new Date(),
    })) });
    for (const userId of [seller, buyer, admin]) {
      const session = await prisma.session.create({ data: { userId, expiresAt: new Date(Date.now() + 3600_000) } });
      tokens.set(userId, `Bearer ${signAccessToken(userId, session.id)}`);
    }
    await prisma.category.create({ data: { id: root, name: "Root", slug: root } });
    await prisma.category.create({ data: { id: leaf, parentId: root, name: "Leaf", slug: leaf } });
    await prisma.order.createMany({ data: [order, reservedOrder].map((id) => ({
      id, code: id, sellerId: seller, buyerId: buyer, status: id === order ? "COMPLETED" : "PENDING",
      deliveryMethod: "MEETUP", subtotal: "999999999", shippingFee: "123", totalAmount: "1000000122",
    })) });
    await prisma.product.createMany({ data: statuses.map((status, index) => ({
      id: ids[index]!, sellerId: seller, categoryId: leaf, title: `Snapshot ${index}`, description: "Snapshot detail",
      price: "999999999", shippingFee: "123", condition: "FAIR", deliveryMethod: "BOTH", provinceCode: "VN-01", usageMonths: 13,
      status, reservedOrderId: status === "RESERVED" ? reservedOrder : null,
      isBlocked: index === 6, blockReason: index === 6 ? "Private block reason" : null,
      rejectionReason: status === "REJECTED" ? "Private rejection reason" : null,
      deletedAt: index === 7 ? new Date() : null, createdAt: new Date(1700000000000 + index * 1000),
    })) });
    await prisma.productImage.createMany({ data: [
      { id: image, productId: ids[0]!, url: "/api/v1/uploads/fixture.png", storagePath, sortOrder: 0, createdAt: imageTime },
      { productId: ids[0]!, url: "https://example.test/second.png", sortOrder: 1 },
    ] });
    await prisma.review.create({ data: { orderId: order, reviewerId: buyer, reviewedUserId: seller, productId: ids[0]!, rating: 5 } });
    await prisma.favorite.create({ data: { userId: buyer, productId: ids[0]! } });
  }, 120_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    await prisma.product.deleteMany({ where: { id: { in: ids } } });
    await prisma.order.deleteMany({ where: { id: { in: [order, reservedOrder] } } });
    await prisma.user.deleteMany({ where: { id: { in: [seller, buyer, admin] } } });
    await prisma.category.deleteMany({ where: { id: leaf } });
    await prisma.category.deleteMany({ where: { id: root } });
    await Promise.all([disconnectDatabaseClient(prisma), disconnectDatabaseClient(backgroundPrisma)]);
  }, 120_000);

  it("loads all projection data in one SQL with exact money, dates, category paths and no seller PII", async () => {
    const query = vi.spyOn(prisma, "$queryRaw");
    let result;
    try {
      result = await readProducts({ kind: "detail", id: ids[0]! }, ANONYMOUS_VIEWER);
      expect(query).toHaveBeenCalledTimes(1);
    } finally { query.mockRestore(); }
    expect(result.items[0]!.product.price.toString()).toBe("999999999");
    expect(result.items[0]!.product.images[0]!.createdAt).toEqual(imageTime);
    expect(result.items[0]!.product.seller).not.toHaveProperty("passwordHash");
    const response = await get(`/products/${ids[0]}`, buyer).expect(200);
    expect(response.body.data).toMatchObject({
      price: "999999999", shipping_fee: "123", usage_months: 13, condition: "FAIR", delivery_method: "BOTH",
      category_path: ["Root", "Leaf"], is_favorited: true,
      seller: { rating: 5, review_count: 1, completed_sales_count: 1 }, capabilities: { can_buy: true, can_edit: false },
    });
    expect(response.body.data.images.map((entry: { sort_order: number }) => entry.sort_order)).toEqual([0, 1]);
    expect(response.body.data.images[0]).not.toHaveProperty("storage_path");
    for (const privateValue of ["private-test-hash", "private-phone", "private-address", `${seller}@example.test`]) {
      expect(JSON.stringify(response.body.data)).not.toContain(privateValue);
    }
  });

  it("keeps own listing scope, deleted/blocked rows, filters, totals and empty pages", async () => {
    const page = await get("/account/products?page_size=2", seller).expect(200);
    expect(page.body.data.meta).toMatchObject({ total: 8, total_pages: 4 });
    expect(page.body.data.items.map((entry: { id: string }) => entry.id)).toEqual([ids[7], ids[6]]);
    expect(page.body.data.items[0].allowed_actions).toEqual(["view"]);
    expect(page.body.data.items[1]).toMatchObject({ block_reason: "Private block reason", is_hidden: true });
    const filtered = await get("/account/products?status=ACTIVE", seller).expect(200);
    expect(filtered.body.data.meta.total).toBe(2);
    const empty = await get("/account/products?page=9&page_size=2", seller).expect(200);
    expect(empty.body.data).toMatchObject({ items: [], meta: { total: 8 } });
    expect((await get("/account/products", buyer).expect(200)).body.data).toMatchObject({ items: [], meta: { total: 0 } });
    const detail = await get(`/products/${ids[0]}`, seller).expect(200);
    expect(detail.body.data.images[0].storage_path).toBe(storagePath);
    expect(detail.body.data.capabilities).toMatchObject({ can_edit: true, can_manage: true, can_buy: false });
  });

  it("enforces public/owner/admin visibility and keeps profile pagination exact", async () => {
    const profile = await get(`/users/${seller}/products?page_size=2`).expect(200);
    expect(profile.body.data.meta).toMatchObject({ total: 3, total_pages: 2 });
    expect(profile.body.data.items.map((entry: { id: string }) => entry.id)).toEqual([ids[2], ids[1]]);
    expect((await get(`/users/${seller}/products?page=3&page_size=2`).expect(200)).body.data)
      .toMatchObject({ items: [], meta: { total: 3 } });
    await get(`/users/${randomUUID()}/products`).expect(404);
    for (const index of [1, 2]) await get(`/products/${ids[index]}`).expect(200);
    for (const index of [3, 4, 5, 6]) {
      await get(`/products/${ids[index]}`).expect(404);
      await get(`/products/${ids[index]}`, buyer).expect(404);
      await get(`/products/${ids[index]}`, seller).expect(200);
      await get(`/products/${ids[index]}`, admin).expect(200);
    }
    await get(`/products/${ids[7]}`, seller).expect(404);
  }, 120_000);

  it("rechecks favorites, reputation, ancestor/category policy and seller state without caching", async () => {
    await prisma.favorite.deleteMany({ where: { userId: buyer } });
    await prisma.review.updateMany({ where: { reviewedUserId: seller }, data: { hiddenAt: new Date() } });
    expect((await get(`/products/${ids[0]}`, buyer).expect(200)).body.data)
      .toMatchObject({ is_favorited: false, seller: { rating: null, review_count: 0 } });
    await prisma.category.update({ where: { id: root }, data: { status: "INACTIVE" } });
    await get(`/products/${ids[0]}`).expect(404);
    expect((await get(`/users/${seller}/products`).expect(200)).body.data.meta.total).toBe(0);
    expect((await get(`/products/${ids[0]}`, admin).expect(200)).body.data.capabilities.can_buy).toBe(false);
    expect((await get("/account/products", seller).expect(200)).body.data.meta.total).toBe(8);
    await prisma.category.update({ where: { id: root }, data: { status: "ACTIVE" } });
    await prisma.category.create({ data: { parentId: leaf, name: "New child", slug: randomUUID() } });
    await get(`/products/${ids[0]}`).expect(404);
    expect((await get(`/users/${seller}/products`).expect(200)).body.data.meta.total).toBe(0);
    await prisma.category.deleteMany({ where: { parentId: leaf } });
    await prisma.user.update({ where: { id: seller }, data: { status: "LOCKED" } });
    await get(`/products/${ids[0]}`).expect(404);
    await get(`/users/${seller}/products`).expect(404);
    await get("/account/products", seller).expect(403);
    await prisma.user.update({ where: { id: seller }, data: { status: "ACTIVE" } });
    await get(`/products/${ids[0]}`).expect(200);
    await prisma.session.updateMany({ where: { userId: seller }, data: { revokedAt: new Date() } });
    await get("/account/products", seller).expect(401);
    await get(`/products/${ids[3]}`, seller).expect(404);
  }, 120_000);
});
