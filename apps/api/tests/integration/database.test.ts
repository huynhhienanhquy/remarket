import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { prisma } from "../../src/utils/prisma.js";
import { signAccessToken } from "../../src/shared/tokens.js";
import {
  cleanupOrphanUploads,
  createOrderReminders,
  expirePendingOrders,
} from "../../src/jobs/runner.js";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const app = createApp();
const ids: string[] = [];

async function cleanup(): Promise<void> {
  if (ids.length === 0) return;
  await prisma.outboxEvent.deleteMany({ where: { aggregateId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { referenceId: { in: ids } }] } });
  await prisma.supportTicket.deleteMany({ where: { OR: [{ userId: { in: ids } }, { orderId: { in: ids } }] } });
  await prisma.product.updateMany({
    where: { sellerId: { in: ids }, reservedOrderId: { not: null } },
    data: { status: "INACTIVE", reservedOrderId: null },
  });
  await prisma.order.deleteMany({ where: { OR: [{ buyerId: { in: ids } }, { sellerId: { in: ids } }] } });
  await prisma.checkoutRequest.deleteMany({ where: { userId: { in: ids } } });
  await prisma.product.deleteMany({ where: { sellerId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.authToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.category.deleteMany({ where: { id: { in: ids } } });
  ids.length = 0;
}

describe.skipIf(!enabled)("PostgreSQL integration", () => {
  beforeEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  async function accessToken(userId: string): Promise<string> {
    const session = await prisma.session.create({
      data: { userId, expiresAt: new Date(Date.now() + 60_000) },
    });
    return signAccessToken(userId, session.id);
  }

  it("maps concurrent duplicate registration to a field-level validation error", async () => {
    const marker = randomUUID();
    const email = `register-${marker}@example.test`;
    const payload = {
      full_name: "Người đăng ký đồng thời",
      email,
      password: "test-password-2026",
      confirm_password: "test-password-2026",
      phone: "0900000000",
    };

    const responses = await Promise.all([
      request(app).post("/api/v1/auth/register").send(payload),
      request(app).post("/api/v1/auth/register").send(payload),
    ]);
    const created = await prisma.user.findUniqueOrThrow({ where: { email } });
    ids.push(created.id);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 422]);
    const rejected = responses.find((response) => response.status === 422);
    expect(rejected?.body).toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        details: { fields: { email: "Email đã được sử dụng." } },
      },
    });
  });

  it("revokes the complete session when a rotated refresh token is replayed", async () => {
    const userId = randomUUID();
    ids.push(userId);
    await prisma.user.create({
      data: {
        id: userId,
        fullName: "Người kiểm thử",
        email: `refresh-${userId}@example.test`,
        passwordHash: await bcrypt.hash("test-password-2026", 4),
        emailVerifiedAt: new Date(),
      },
    });

    const login = await request(app)
      .post("/api/v1/auth/login")
      .set("Origin", "http://localhost:5173")
      .send({ email: `refresh-${userId}@example.test`, password: "test-password-2026" })
      .expect(200);
    const oldCookie = login.headers["set-cookie"]?.[0]?.split(";", 1)[0];
    expect(oldCookie).toBeTruthy();
    expect(login.headers["set-cookie"]?.[0]).toContain("Path=/api/v1/auth");
    expect(login.headers["set-cookie"]?.[0]).toContain("HttpOnly");

    // Repeated/cancelled page discovery must not consume the cookie. Actual
    // refresh below must still rotate it and reject replay of the old token.
    const discoveries = await Promise.all([0, 1].map(() => request(app)
      .post("/api/v1/auth/bootstrap").set("Origin", "http://localhost:5173")
      .set("Cookie", oldCookie!).expect(200)));
    expect(discoveries.every((response) => response.body.data.user.id === userId)).toBe(true);
    expect(discoveries.every((response) => response.headers["set-cookie"] === undefined)).toBe(true);
    expect(await prisma.authToken.count({ where: { userId, purpose: "REFRESH", consumedAt: { not: null } } })).toBe(0);

    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", oldCookie!)
      .expect(200);
    await request(app)
      .post("/api/v1/auth/refresh")
      .set("Origin", "http://localhost:5173")
      .set("Cookie", oldCookie!)
      .expect(401);

    expect(await prisma.session.count({ where: { userId, revokedAt: null } })).toBe(0);
  });

  it("allows exactly one checkout to reserve the same product", async () => {
    const buyerA = randomUUID();
    const buyerB = randomUUID();
    const seller = randomUUID();
    const category = randomUUID();
    const product = randomUUID();
    ids.push(buyerA, buyerB, seller, category, product);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [buyerA, buyerB, seller].map((id, index) => ({
        id,
        fullName: `Test User ${index}`,
        email: `${id}@example.test`,
        passwordHash,
        emailVerifiedAt: new Date(),
      })),
    });
    await prisma.category.create({ data: { id: category, name: "Test leaf", slug: `test-${category}` } });
    await prisma.product.create({
      data: {
        id: product,
        title: "Sản phẩm kiểm thử race",
        description: "Mô tả đủ dài cho sản phẩm dùng trong integration test.",
        price: "100000",
        condition: "GOOD",
        categoryId: category,
        provinceCode: "VN-01",
        deliveryMethod: "COD",
        shippingFee: "30000",
        status: "ACTIVE",
        sellerId: seller,
        publishedAt: new Date(),
      },
    });

    const [tokenA, tokenB] = await Promise.all([accessToken(buyerA), accessToken(buyerB)]);
    const payload = (buyerId: string) => ({
      items: [{ product_id: product, expected_price: "100000" }],
      deliveries: [{
        seller_id: seller,
        method: "COD",
        recipient_name: `Buyer ${buyerId.slice(0, 4)}`,
        recipient_phone: "0900000000",
        delivery_address: "1 Đường kiểm thử, Hà Nội",
        expected_shipping_fee: "30000",
      }],
    });

    const responses = await Promise.all([
      request(app).post("/api/v1/checkout").set("Authorization", `Bearer ${tokenA}`).set("Idempotency-Key", randomUUID()).send(payload(buyerA)),
      request(app).post("/api/v1/checkout").set("Authorization", `Bearer ${tokenB}`).set("Idempotency-Key", randomUUID()).send(payload(buyerB)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(await prisma.order.count({ where: { items: { some: { productId: product } } } })).toBe(1);
    const held = await prisma.product.findUniqueOrThrow({ where: { id: product } });
    expect(held.status).toBe("RESERVED");
    expect(held.reservedOrderId).toBeTruthy();
  });

  it("creates a listing before attaching uploaded assets and rolls back unauthorized reuse", async () => {
    const seller = randomUUID(), outsider = randomUUID(), category = randomUUID(), assetId = randomUUID();
    ids.push(seller, outsider, category, assetId);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({ data: [seller, outsider].map((id) => ({ id, fullName: "Upload Test", email: `${id}@example.test`, passwordHash, emailVerifiedAt: new Date() })) });
    await prisma.category.create({ data: { id: category, name: "Upload leaf", slug: `upload-${category}` } });
    const storagePath = `users/${seller}/product/${assetId}.png`;
    await prisma.uploadAsset.create({ data: { id: assetId, userId: seller, purpose: "product", storagePath, mimeType: "image/png", byteSize: 100 } });
    const payload = { title: "Tin đăng với ảnh upload thật", description: "Mô tả đủ dài để kiểm tra việc gắn ảnh trong giao dịch tạo tin.", price: "100000", condition: "GOOD", usage_months: null, category_id: category, province_code: "VN-52", delivery_method: "COD", shipping_fee: "30000", images: [{ storage_path: storagePath, url: `/api/v1/uploads/${assetId}.png`, sort_order: 0 }] };
    const sellerToken = await accessToken(seller);
    const created = await request(app).post("/api/v1/products").set("Authorization", `Bearer ${sellerToken}`).send(payload).expect(201);
    ids.push(created.body.data.id);
    expect(created.body.data.status).toBe("PENDING");
    expect(await prisma.uploadAsset.findUniqueOrThrow({ where: { id: assetId } })).toMatchObject({ productId: created.body.data.id, attachedAt: expect.any(Date) });
    const outsiderToken = await accessToken(outsider);
    await request(app).post("/api/v1/products").set("Authorization", `Bearer ${outsiderToken}`).send(payload).expect(422);
    expect(await prisma.product.count({ where: { sellerId: outsider } })).toBe(0);
  });

  it("replays the same checkout key and rejects the key with a different payload", async () => {
    const buyer = randomUUID();
    const seller = randomUUID();
    const category = randomUUID();
    const product = randomUUID();
    ids.push(buyer, seller, category, product);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [
        { id: buyer, fullName: "Idempotent Buyer", email: `${buyer}@example.test`, passwordHash, emailVerifiedAt: new Date() },
        { id: seller, fullName: "Idempotent Seller", email: `${seller}@example.test`, passwordHash, emailVerifiedAt: new Date() },
      ],
    });
    await prisma.category.create({
      data: { id: category, name: "Idempotency leaf", slug: `idempotency-${category}` },
    });
    await prisma.product.create({
      data: {
        id: product,
        title: "Sản phẩm kiểm thử idempotency",
        description: "Mô tả đủ dài để kiểm tra replay và conflict của checkout.",
        price: "175000",
        condition: "GOOD",
        categoryId: category,
        provinceCode: "VN-01",
        deliveryMethod: "COD",
        shippingFee: "25000",
        status: "ACTIVE",
        sellerId: seller,
        publishedAt: new Date(),
      },
    });
    const token = await accessToken(buyer);
    const key = randomUUID();
    const payload = {
      items: [{ product_id: product, expected_price: "175000" }],
      deliveries: [{
        seller_id: seller,
        method: "COD",
        recipient_name: "Idempotent Buyer",
        recipient_phone: "0900000000",
        delivery_address: "1 Đường kiểm thử, Hà Nội",
        expected_shipping_fee: "25000",
      }],
    };
    const checkout = () => request(app)
      .post("/api/v1/checkout")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", key);

    const first = await checkout().send(payload).expect(201);
    const replay = await checkout().send(payload).expect(201);
    expect(replay.body.data.checkout_request_id).toBe(first.body.data.checkout_request_id);
    expect(replay.body.data.orders.map((order: { id: string }) => order.id)).toEqual(
      first.body.data.orders.map((order: { id: string }) => order.id),
    );
    expect(await prisma.order.count({ where: { buyerId: buyer } })).toBe(1);
    expect(await prisma.checkoutRequest.count({ where: { userId: buyer } })).toBe(1);

    const conflictPayload = {
      ...payload,
      deliveries: [{ ...payload.deliveries[0], recipient_name: "Tên nhận hàng khác" }],
    };
    const conflict = await checkout().send(conflictPayload).expect(409);
    expect(conflict.body.error.code).toBe("IDEMPOTENCY_CONFLICT");
    expect(await prisma.order.count({ where: { buyerId: buyer } })).toBe(1);
  });

  it("rolls back every seller group when one item in a multi-seller checkout is stale", async () => {
    const buyer = randomUUID();
    const sellerA = randomUUID();
    const sellerB = randomUUID();
    const category = randomUUID();
    const productA = randomUUID();
    const productB = randomUUID();
    ids.push(buyer, sellerA, sellerB, category, productA, productB);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [buyer, sellerA, sellerB].map((id, index) => ({
        id,
        fullName: `Rollback User ${index}`,
        email: `${id}@example.test`,
        passwordHash,
        emailVerifiedAt: new Date(),
      })),
    });
    await prisma.category.create({
      data: { id: category, name: "Rollback leaf", slug: `rollback-${category}` },
    });
    await prisma.product.createMany({
      data: [
        {
          id: productA,
          title: "Sản phẩm hợp lệ trong giỏ nhiều seller",
          description: "Mô tả đủ dài cho sản phẩm hợp lệ của bài kiểm tra rollback.",
          price: "100000",
          condition: "GOOD",
          categoryId: category,
          provinceCode: "VN-01",
          deliveryMethod: "COD",
          shippingFee: "20000",
          status: "ACTIVE",
          sellerId: sellerA,
          publishedAt: new Date(),
        },
        {
          id: productB,
          title: "Sản phẩm đổi giá trong giỏ nhiều seller",
          description: "Mô tả đủ dài cho sản phẩm đổi giá của bài kiểm tra rollback.",
          price: "250000",
          condition: "GOOD",
          categoryId: category,
          provinceCode: "VN-01",
          deliveryMethod: "COD",
          shippingFee: "30000",
          status: "ACTIVE",
          sellerId: sellerB,
          publishedAt: new Date(),
        },
      ],
    });
    const token = await accessToken(buyer);
    const response = await request(app)
      .post("/api/v1/checkout")
      .set("Authorization", `Bearer ${token}`)
      .set("Idempotency-Key", randomUUID())
      .send({
        items: [
          { product_id: productA, expected_price: "100000" },
          { product_id: productB, expected_price: "249000" },
        ],
        deliveries: [
          {
            seller_id: sellerA,
            method: "COD",
            recipient_name: "Rollback Buyer",
            recipient_phone: "0900000000",
            delivery_address: "1 Đường kiểm thử, Hà Nội",
            expected_shipping_fee: "20000",
          },
          {
            seller_id: sellerB,
            method: "COD",
            recipient_name: "Rollback Buyer",
            recipient_phone: "0900000000",
            delivery_address: "1 Đường kiểm thử, Hà Nội",
            expected_shipping_fee: "30000",
          },
        ],
      })
      .expect(409);

    expect(response.body.error.code).toBe("PRICE_CHANGED");
    expect(await prisma.order.count({ where: { buyerId: buyer } })).toBe(0);
    expect(await prisma.checkoutRequest.count({ where: { userId: buyer } })).toBe(0);
    const products = await prisma.product.findMany({
      where: { id: { in: [productA, productB] } },
      orderBy: { id: "asc" },
    });
    expect(products.every((product) => product.status === "ACTIVE")).toBe(true);
    expect(products.every((product) => product.reservedOrderId === null)).toBe(true);
  });

  it("never leaves a live order when an admin locks its seller during checkout", async () => {
    const buyer = randomUUID();
    const seller = randomUUID();
    const admin = randomUUID();
    const category = randomUUID();
    const product = randomUUID();
    ids.push(buyer, seller, admin, category, product);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [
        { id: buyer, fullName: "Race Buyer", email: `${buyer}@example.test`, passwordHash, emailVerifiedAt: new Date() },
        { id: seller, fullName: "Race Seller", email: `${seller}@example.test`, passwordHash, emailVerifiedAt: new Date() },
        { id: admin, fullName: "Race Admin", email: `${admin}@example.test`, passwordHash, emailVerifiedAt: new Date(), role: "ADMIN" },
      ],
    });
    await prisma.category.create({ data: { id: category, name: "Race leaf", slug: `race-${category}` } });
    await prisma.product.create({
      data: {
        id: product,
        title: "Sản phẩm khóa đồng thời",
        description: "Mô tả đủ dài để kiểm tra thao tác khóa đồng thời checkout.",
        price: "250000",
        condition: "GOOD",
        categoryId: category,
        provinceCode: "VN-01",
        deliveryMethod: "COD",
        shippingFee: "30000",
        status: "ACTIVE",
        sellerId: seller,
        publishedAt: new Date(),
      },
    });
    const [buyerToken, adminToken] = await Promise.all([accessToken(buyer), accessToken(admin)]);
    const payload = {
      items: [{ product_id: product, expected_price: "250000" }],
      deliveries: [{
        seller_id: seller,
        method: "COD",
        recipient_name: "Race Buyer",
        recipient_phone: "0900000000",
        delivery_address: "1 Đường kiểm thử, Hà Nội",
        expected_shipping_fee: "30000",
      }],
    };

    const [checkout, lock] = await Promise.all([
      request(app).post("/api/v1/checkout").set("Authorization", `Bearer ${buyerToken}`).set("Idempotency-Key", randomUUID()).send(payload),
      request(app).post(`/api/v1/admin/users/${seller}/lock`).set("Authorization", `Bearer ${adminToken}`).send({ reason: "Integration race test" }),
    ]);
    expect(lock.status).toBe(200);
    expect([201, 409]).toContain(checkout.status);
    const orders = await prisma.order.findMany({
      where: { buyerId: buyer, sellerId: seller },
      select: { status: true },
    });
    expect(orders.every((order) => order.status === "CANCELLED")).toBe(true);
    const saved = await prisma.product.findUniqueOrThrow({ where: { id: product } });
    expect(saved.status).toBe("INACTIVE");
    expect(saved.reservedOrderId).toBeNull();
  });

  it("serializes seller confirmation against expiration without a double transition", async () => {
    const buyer = randomUUID();
    const seller = randomUUID();
    const category = randomUUID();
    const order = randomUUID();
    const product = randomUUID();
    ids.push(buyer, seller, category, order, product);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [
        { id: buyer, fullName: "Expiry Buyer", email: `${buyer}@example.test`, passwordHash, emailVerifiedAt: new Date() },
        { id: seller, fullName: "Expiry Seller", email: `${seller}@example.test`, passwordHash, emailVerifiedAt: new Date() },
      ],
    });
    await prisma.category.create({
      data: { id: category, name: "Expiry leaf", slug: `expiry-${category}` },
    });
    await prisma.order.create({
      data: {
        id: order,
        code: `RM-${order.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
        buyerId: buyer,
        sellerId: seller,
        deliveryMethod: "COD",
        subtotal: "100000",
        shippingFee: "20000",
        totalAmount: "120000",
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    await prisma.product.create({
      data: {
        id: product,
        title: "Sản phẩm chờ hết hạn",
        description: "Mô tả đủ dài để kiểm tra xác nhận đồng thời với worker hết hạn.",
        price: "100000",
        condition: "GOOD",
        categoryId: category,
        provinceCode: "VN-01",
        deliveryMethod: "COD",
        shippingFee: "20000",
        status: "RESERVED",
        reservedOrderId: order,
        sellerId: seller,
        publishedAt: new Date(),
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order,
        productId: product,
        titleSnapshot: "Sản phẩm chờ hết hạn",
        conditionSnapshot: "GOOD",
        price: "100000",
        sortOrder: 0,
      },
    });
    const token = await accessToken(seller);

    const [confirmation, expired] = await Promise.all([
      request(app)
        .post(`/api/v1/orders/${order}/actions`)
        .set("Authorization", `Bearer ${token}`)
        .send({ action: "confirm", expected_version: 1 }),
      expirePendingOrders(),
    ]);

    expect(confirmation.status).toBe(409);
    expect(["ORDER_EXPIRED", "INVALID_ORDER_TRANSITION", "VERSION_CONFLICT"])
      .toContain(confirmation.body.error.code);
    expect(expired).toBe(1);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order } }))
      .toMatchObject({ status: "CANCELLED", version: 2, cancellationReason: "SELLER_TIMEOUT" });
    expect(await prisma.orderStatusHistory.count({
      where: { orderId: order, toStatus: "CANCELLED" },
    })).toBe(1);
    expect(await prisma.orderStatusHistory.count({
      where: { orderId: order, toStatus: "CONFIRMED" },
    })).toBe(0);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: product } }))
      .toMatchObject({ status: "ACTIVE", reservedOrderId: null });
  });

  it("serializes completion against resolving an open order ticket", async () => {
    const buyer = randomUUID();
    const seller = randomUUID();
    const admin = randomUUID();
    const category = randomUUID();
    const order = randomUUID();
    const product = randomUUID();
    const ticket = randomUUID();
    ids.push(buyer, seller, admin, category, order, product, ticket);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [
        { id: buyer, fullName: "Completion Buyer", email: `${buyer}@example.test`, passwordHash, emailVerifiedAt: new Date() },
        { id: seller, fullName: "Completion Seller", email: `${seller}@example.test`, passwordHash, emailVerifiedAt: new Date() },
        { id: admin, fullName: "Completion Admin", email: `${admin}@example.test`, passwordHash, emailVerifiedAt: new Date(), role: "ADMIN" },
      ],
    });
    await prisma.category.create({
      data: { id: category, name: "Completion leaf", slug: `completion-${category}` },
    });
    await prisma.order.create({
      data: {
        id: order,
        code: `RM-${order.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
        buyerId: buyer,
        sellerId: seller,
        status: "DELIVERED",
        deliveryMethod: "COD",
        subtotal: "100000",
        shippingFee: "20000",
        totalAmount: "120000",
        deliveredAt: new Date(),
      },
    });
    await prisma.product.create({
      data: {
        id: product,
        title: "Sản phẩm chờ hoàn tất",
        description: "Mô tả đủ dài để kiểm tra hoàn tất đồng thời xử lý hỗ trợ.",
        price: "100000",
        condition: "GOOD",
        categoryId: category,
        provinceCode: "VN-01",
        deliveryMethod: "COD",
        shippingFee: "20000",
        status: "RESERVED",
        reservedOrderId: order,
        sellerId: seller,
        publishedAt: new Date(),
      },
    });
    await prisma.orderItem.create({
      data: {
        orderId: order,
        productId: product,
        titleSnapshot: "Sản phẩm chờ hoàn tất",
        conditionSnapshot: "GOOD",
        price: "100000",
        sortOrder: 0,
      },
    });
    await prisma.supportTicket.create({
      data: {
        id: ticket,
        code: `TK-${ticket.replaceAll("-", "").slice(0, 6).toUpperCase()}`,
        userId: buyer,
        orderId: order,
        assignedAdminId: admin,
        subject: "Vấn đề đang được xử lý",
        type: "ORDER_PROBLEM",
        status: "IN_PROGRESS",
      },
    });
    const [buyerToken, adminToken] = await Promise.all([accessToken(buyer), accessToken(admin)]);

    const [completion, resolution] = await Promise.all([
      request(app)
        .post(`/api/v1/orders/${order}/actions`)
        .set("Authorization", `Bearer ${buyerToken}`)
        .send({
          action: "complete",
          expected_version: 1,
          buyer_confirmed_received: true,
          buyer_confirmed_paid: true,
        }),
      request(app)
        .patch(`/api/v1/admin/support-tickets/${ticket}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ status: "RESOLVED", resolution_note: "Đã xử lý xong vấn đề." }),
    ]);

    expect(resolution.status).toBe(200);
    expect([200, 409]).toContain(completion.status);
    const savedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order } });
    const savedProduct = await prisma.product.findUniqueOrThrow({ where: { id: product } });
    expect(await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket } }))
      .toMatchObject({ status: "RESOLVED" });
    if (completion.status === 200) {
      expect(savedOrder).toMatchObject({ status: "COMPLETED", version: 2 });
      expect(savedProduct).toMatchObject({ status: "SOLD", reservedOrderId: null });
    } else {
      expect(completion.body.error.code).toBe("INVALID_ORDER_TRANSITION");
      expect(savedOrder).toMatchObject({ status: "DELIVERED", version: 1 });
      expect(savedProduct).toMatchObject({ status: "RESERVED", reservedOrderId: order });
    }
  });

  it("deduplicates notification creation when the reminder job is retried concurrently", async () => {
    const buyer = randomUUID();
    const seller = randomUUID();
    const order = randomUUID();
    ids.push(buyer, seller, order);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [
        { id: buyer, fullName: "Reminder Buyer", email: `${buyer}@example.test`, passwordHash, emailVerifiedAt: new Date() },
        { id: seller, fullName: "Reminder Seller", email: `${seller}@example.test`, passwordHash, emailVerifiedAt: new Date() },
      ],
    });
    await prisma.order.create({
      data: {
        id: order,
        code: `RM-${order.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
        buyerId: buyer,
        sellerId: seller,
        status: "CONFIRMED",
        deliveryMethod: "COD",
        subtotal: "100000",
        shippingFee: "20000",
        totalAmount: "120000",
        confirmedAt: new Date(Date.now() - 73 * 60 * 60 * 1000),
      },
    });

    const attempts = await Promise.all([createOrderReminders(), createOrderReminders()]);
    expect(attempts.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(await prisma.notification.count({
      where: { userId: seller, dedupeKey: `order:${order}:confirmed-72h` },
    })).toBe(1);
  });

  it("allows only one concurrent decision for the same pending report", async () => {
    const admin = randomUUID();
    const reporter = randomUUID();
    const target = randomUUID();
    const reportId = randomUUID();
    ids.push(admin, reporter, target, reportId);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [
        { id: admin, fullName: "Report Admin", email: `${admin}@example.test`, passwordHash, emailVerifiedAt: new Date(), role: "ADMIN" },
        { id: reporter, fullName: "Reporter", email: `${reporter}@example.test`, passwordHash, emailVerifiedAt: new Date() },
        { id: target, fullName: "Target", email: `${target}@example.test`, passwordHash, emailVerifiedAt: new Date() },
      ],
    });
    await prisma.report.create({
      data: {
        id: reportId,
        targetType: "user",
        targetId: target,
        targetLabel: "Target",
        targetUserId: target,
        reporterId: reporter,
        reason: "SPAM",
      },
    });
    const token = await accessToken(admin);
    const decide = () => request(app)
      .post(`/api/v1/admin/reports/${reportId}/resolve`)
      .set("Authorization", `Bearer ${token}`)
      .send({ resolution_note: "Đã kiểm tra báo cáo", action: "none" });
    const responses = await Promise.all([decide(), decide()]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await prisma.report.count({ where: { id: reportId, status: "RESOLVED" } })).toBe(1);
    expect(await prisma.notification.count({ where: { dedupeKey: `report-result:${reportId}` } })).toBe(1);
  });

  it("deduplicates retried chat messages and keeps cursor pagination stable", async () => {
    const buyer = randomUUID();
    const seller = randomUUID();
    const conversation = randomUUID();
    const pagedConversation = randomUUID();
    ids.push(buyer, seller, conversation, pagedConversation);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [
        { id: buyer, fullName: "Chat Buyer", email: `${buyer}@example.test`, passwordHash, emailVerifiedAt: new Date() },
        { id: seller, fullName: "Chat Seller", email: `${seller}@example.test`, passwordHash, emailVerifiedAt: new Date() },
      ],
    });
    await prisma.conversation.createMany({
      data: [
        { id: conversation, buyerId: buyer, sellerId: seller },
        { id: pagedConversation, buyerId: buyer, sellerId: seller },
      ],
    });
    const token = await accessToken(buyer);
    const clientMessageId = randomUUID();
    const send = () => request(app)
      .post(`/api/v1/conversations/${conversation}/messages`)
      .set("Authorization", `Bearer ${token}`)
      .send({ client_message_id: clientMessageId, content: "Tin nhắn chỉ được lưu một lần" });

    const first = await send().expect(201);
    const replay = await send().expect(200);
    const storedMessageId = first.body.data.message.id as string;
    ids.push(storedMessageId);
    expect(replay.body.data.message.id).toBe(storedMessageId);
    expect(await prisma.message.count({ where: { conversationId: conversation } })).toBe(1);

    const sameTimestamp = new Date("2026-01-02T03:04:05.000Z");
    const messageIds = Array.from({ length: 5 }, () => randomUUID());
    ids.push(...messageIds);
    await prisma.message.createMany({
      data: messageIds.map((id, index) => ({
        id,
        conversationId: pagedConversation,
        senderId: index % 2 === 0 ? buyer : seller,
        clientMessageId: `cursor-${index}`,
        content: `Cursor message ${index}`,
        createdAt: sameTimestamp,
      })),
    });

    const page = (cursor?: string) => {
      const query = cursor
        ? `?page_size=2&cursor=${encodeURIComponent(cursor)}`
        : "?page_size=2";
      return request(app)
        .get(`/api/v1/conversations/${pagedConversation}/messages${query}`)
        .set("Authorization", `Bearer ${token}`);
    };
    const firstPage = await page().expect(200);
    const secondPage = await page(firstPage.body.data.next_cursor).expect(200);
    const thirdPage = await page(secondPage.body.data.next_cursor).expect(200);
    const returnedIds = [firstPage, secondPage, thirdPage]
      .flatMap((response) => response.body.data.items)
      .map((message: { id: string }) => message.id);

    expect(firstPage.body.data.next_cursor).toBeTruthy();
    expect(secondPage.body.data.next_cursor).toBeTruthy();
    expect(thirdPage.body.data.next_cursor).toBeNull();
    expect(new Set(returnedIds).size).toBe(5);
    expect(new Set(returnedIds)).toEqual(new Set(messageIds));
  });

  it("hides private orders, conversations, tickets and notifications from outsiders", async () => {
    const buyer = randomUUID();
    const seller = randomUUID();
    const outsider = randomUUID();
    const order = randomUUID();
    const conversation = randomUUID();
    const ticket = randomUUID();
    const notification = randomUUID();
    ids.push(buyer, seller, outsider, order, conversation, ticket, notification);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [buyer, seller, outsider].map((id, index) => ({
        id,
        fullName: `Private User ${index}`,
        email: `${id}@example.test`,
        passwordHash,
        emailVerifiedAt: new Date(),
      })),
    });
    await prisma.order.create({
      data: {
        id: order,
        code: `RM-${order.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
        buyerId: buyer,
        sellerId: seller,
        deliveryMethod: "COD",
        subtotal: "100000",
        shippingFee: "20000",
        totalAmount: "120000",
      },
    });
    await prisma.conversation.create({
      data: { id: conversation, buyerId: buyer, sellerId: seller },
    });
    await prisma.supportTicket.create({
      data: {
        id: ticket,
        code: `TK-${ticket.replaceAll("-", "").slice(0, 6).toUpperCase()}`,
        userId: buyer,
        subject: "Yêu cầu riêng tư",
        type: "ACCOUNT",
      },
    });
    await prisma.notification.create({
      data: {
        id: notification,
        userId: buyer,
        type: "ORDER_CREATED",
        title: "Thông báo riêng tư",
        content: "Nội dung chỉ chủ tài khoản được xem.",
        referenceType: "system",
      },
    });
    const token = await accessToken(outsider);
    const responses = await Promise.all([
      request(app).get(`/api/v1/orders/${order}`).set("Authorization", `Bearer ${token}`),
      request(app)
        .get(`/api/v1/conversations/${conversation}/messages`)
        .set("Authorization", `Bearer ${token}`),
      request(app)
        .get(`/api/v1/support/tickets/${ticket}`)
        .set("Authorization", `Bearer ${token}`),
      request(app)
        .post(`/api/v1/notifications/${notification}/read`)
        .set("Authorization", `Bearer ${token}`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(responses.every((response) => response.body.error.code === "NOT_FOUND")).toBe(true);
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: notification } }))
      .toMatchObject({ readAt: null });
  });

  it("retains blocked saved items without leaking listing content", async () => {
    const buyer = randomUUID();
    const seller = randomUUID();
    const category = randomUUID();
    const product = randomUUID();
    ids.push(buyer, seller, category, product);
    const passwordHash = await bcrypt.hash("unused-test-password", 4);
    await prisma.user.createMany({
      data: [
        { id: buyer, fullName: "Saved Buyer", email: `${buyer}@example.test`, passwordHash, emailVerifiedAt: new Date() },
        { id: seller, fullName: "Saved Seller", email: `${seller}@example.test`, passwordHash, emailVerifiedAt: new Date() },
      ],
    });
    await prisma.category.create({
      data: { id: category, name: "Saved leaf", slug: `saved-${category}` },
    });
    await prisma.product.create({
      data: {
        id: product,
        title: "Tiêu đề riêng tư không được rò rỉ",
        description: "Mô tả đủ dài của sản phẩm đã bị quản trị viên chặn.",
        price: "990000",
        condition: "GOOD",
        categoryId: category,
        provinceCode: "VN-01",
        deliveryMethod: "COD",
        shippingFee: "30000",
        status: "ACTIVE",
        isBlocked: true,
        blockReason: "integration privacy test",
        sellerId: seller,
        publishedAt: new Date(),
        images: { create: { url: "/api/v1/uploads/private.webp", sortOrder: 0 } },
      },
    });
    await Promise.all([
      prisma.favorite.create({ data: { userId: buyer, productId: product } }),
      prisma.cartItem.create({ data: { userId: buyer, productId: product } }),
    ]);
    const token = await accessToken(buyer);

    const [favorites, cart] = await Promise.all([
      request(app).get("/api/v1/favorites").set("Authorization", `Bearer ${token}`).expect(200),
      request(app).get("/api/v1/cart").set("Authorization", `Bearer ${token}`).expect(200),
    ]);

    expect(favorites.body.data.items).toHaveLength(1);
    expect(favorites.body.data.items[0]).toMatchObject({
      id: product,
      title: "",
      price: "0",
      image_url: null,
      is_blocked: true,
      is_hidden: true,
    });
    expect(cart.body.data.groups[0].items[0]).toMatchObject({
      product_id: product,
      title: "",
      price: "0",
      image_url: null,
      available: false,
    });
  });

  it("claims only stale unattached uploads and queues durable object deletion", async () => {
    const userId = randomUUID();
    const staleId = randomUUID();
    const attachedId = randomUUID();
    ids.push(userId, staleId, attachedId);
    await prisma.user.create({
      data: {
        id: userId,
        fullName: "Storage Owner",
        email: `${userId}@example.test`,
        passwordHash: await bcrypt.hash("unused-test-password", 4),
        emailVerifiedAt: new Date(),
      },
    });
    const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await prisma.uploadAsset.createMany({
      data: [
        {
          id: staleId,
          userId,
          purpose: "product",
          storagePath: `users/${userId}/product/${staleId}.webp`,
          mimeType: "image/webp",
          byteSize: 10,
          createdAt,
        },
        {
          id: attachedId,
          userId,
          purpose: "avatar",
          storagePath: `users/${userId}/avatar/${attachedId}.webp`,
          mimeType: "image/webp",
          byteSize: 10,
          attachedAt: new Date(),
          createdAt,
        },
      ],
    });

    await cleanupOrphanUploads();

    expect(await prisma.uploadAsset.findUnique({ where: { id: staleId } })).toBeNull();
    expect(await prisma.uploadAsset.findUnique({ where: { id: attachedId } })).not.toBeNull();
    expect(await prisma.outboxEvent.findUnique({
      where: { dedupeKey: `storage-delete:${staleId}` },
    })).toMatchObject({ eventType: "storage.delete", aggregateId: staleId });
  });
});
