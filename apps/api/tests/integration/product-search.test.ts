import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { backgroundPrisma } from "../../src/utils/background-prisma.js";
import { signAccessToken } from "../../src/shared/tokens.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const app = createApp();
const seller = randomUUID(), buyer = randomUUID(), root = randomUUID(), leaf = randomUUID();
const products = [randomUUID(), randomUUID()];
const marker = `search-${randomUUID()}`;
describe.skipIf(!enabled)("single-snapshot product search on PostgreSQL", () => {
  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: { in: products } } });
    await prisma.user.deleteMany({ where: { id: { in: [seller, buyer] } } });
    await prisma.category.deleteMany({ where: { id: leaf } });
    await prisma.category.deleteMany({ where: { id: root } });
    await Promise.all([prisma.$disconnect(), backgroundPrisma.$disconnect()]);
  });
  it("preserves filters, ordering, exact totals, favorites and immediate moderation visibility", async () => {
    await prisma.user.createMany({ data: [seller, buyer].map((id) => ({ id, fullName: marker, email: `${id}@example.test`, passwordHash: "test-only", emailVerifiedAt: new Date() })) });
    await prisma.category.create({ data: { id: root, name: marker, slug: marker } });
    await prisma.category.create({ data: { id: leaf, parentId: root, name: "Leaf", slug: `${marker}-leaf` } });
    await prisma.product.createMany({ data: products.map((id, i) => ({ id, sellerId: seller, categoryId: leaf, title: `${marker} ${i}`, description: "Literal percent % and underscore _ search", price: String(100000 + i * 100000), condition: "GOOD", provinceCode: "VN-01", deliveryMethod: i === 0 ? "BOTH" : "MEETUP", shippingFee: "0", status: "ACTIVE", publishedAt: new Date() })) });
    await prisma.favorite.create({ data: { userId: buyer, productId: products[0]! } });
    const session = await prisma.session.create({ data: { userId: buyer, expiresAt: new Date(Date.now() + 10 * 60_000) } });
    const token = signAccessToken(buyer, session.id);
    const search = async (query = "") => request(app).get(`/api/v1/products?category_id=${root}${query}`).set("Authorization", `Bearer ${token}`).expect(200);
    const all = await search("&sort=price_desc&page_size=1");
    expect(all.body.data.meta).toMatchObject({ total: 2, total_pages: 2 });
    expect(all.body.data.items[0].id).toBe(products[1]);
    const filtered = await search("&delivery_method=COD&condition=GOOD&province_code=VN-01&min_price=100000&max_price=100000");
    expect(filtered.body.data.items.map((p: { id: string }) => p.id)).toEqual([products[0]]);
    expect(filtered.body.data.items[0]).toMatchObject({ price: "100000", is_favorited: true, seller: { rating: null, review_count: 0, completed_sales_count: 0 } });
    const orders = [randomUUID(), randomUUID(), randomUUID()];
    await prisma.order.createMany({ data: orders.map((id, i) => ({
      id, code: `TEST-${id}`, buyerId: buyer, sellerId: seller,
      status: i < 2 ? "COMPLETED" : "PENDING", deliveryMethod: "COD",
      subtotal: "100000", shippingFee: "0", totalAmount: "100000",
      buyerConfirmedReceived: i < 2, buyerConfirmedPaid: i < 2,
      completedAt: i < 2 ? new Date() : null,
    })) });
    const hiddenReview = await prisma.review.create({ data: { orderId: orders[1]!, reviewerId: buyer, reviewedUserId: seller, productId: products[1]!, rating: 1, hiddenAt: new Date() } });
    await prisma.review.create({ data: { orderId: orders[0]!, reviewerId: buyer, reviewedUserId: seller, productId: products[0]!, rating: 5 } });
    expect((await search()).body.data.items[0].seller).toMatchObject({ rating: 5, review_count: 1, completed_sales_count: 2 });
    await prisma.review.update({ where: { id: hiddenReview.id }, data: { hiddenAt: null } });
    expect((await search()).body.data.items[0].seller).toMatchObject({ rating: 3, review_count: 2, completed_sales_count: 2 });
    expect((await search(`&q=${encodeURIComponent(marker)}`)).body.data.meta.total).toBe(2);
    expect((await search("&q=%25")).body.data.meta.total).toBe(2);
    expect((await search("&q=%27%20OR%20true%20--")).body.data.meta.total).toBe(0);
    const emptyPage = await search("&page=3&page_size=1");
    expect(emptyPage.body.data).toMatchObject({ items: [], meta: { total: 2 } });
    await prisma.product.update({ where: { id: products[0] }, data: { isBlocked: true } });
    expect((await search()).body.data.items.map((p: { id: string }) => p.id)).toEqual([products[1]]);
    await prisma.category.update({ where: { id: root }, data: { status: "INACTIVE" } });
    expect((await search()).body.data.meta.total).toBe(0);
    await prisma.category.update({ where: { id: root }, data: { status: "ACTIVE" } });
    await prisma.user.update({ where: { id: seller }, data: { status: "LOCKED" } });
    expect((await search()).body.data.meta.total).toBe(0);
  }, 120_000);
});
