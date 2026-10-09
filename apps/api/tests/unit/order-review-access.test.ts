import { Prisma } from "@prisma/client";
import type { Review, User } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRow } from "../../src/shared/dto-mappers.js";

const client = vi.hoisted(() => ({
  session: { findUnique: vi.fn() }, order: { findUnique: vi.fn() },
  conversation: { findFirst: vi.fn() }, supportTicket: { count: vi.fn() },
  $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { createApp } from "../../src/app.js";
import { signAccessToken } from "../../src/shared/tokens.js";

const now = new Date();
function user(id: string, fullName: string): User {
  return {
    id, fullName, email: `${id}@example.test`, passwordHash: "private-hash",
    avatarUrl: null, role: "USER", status: "ACTIVE", emailVerifiedAt: now,
    emailVerificationRequestedAt: null, phone: "0900000000", provinceCode: null,
    defaultAddress: "Private address", joinedAt: now, lockReason: null, lockedAt: null,
  };
}
const buyer = user("buyer", "Người mua của đơn");
const seller = user("seller", "Người bán của đơn");
const review: Review = {
  id: "review", orderId: "00000000-0000-0000-0000-000000000010",
  reviewerId: buyer.id, reviewedUserId: seller.id, productId: "product",
  rating: 4, comment: "Giao hàng đúng hẹn", createdAt: now,
  hiddenAt: null, hiddenBy: null, hiddenReason: null,
};
const order: OrderRow & { review: Review | null } = {
  id: review.orderId, code: "RM-TEST", buyerId: buyer.id, sellerId: seller.id,
  buyer, seller, status: "COMPLETED", deliveryMethod: "COD", version: 4,
  subtotal: new Prisma.Decimal(100000), shippingFee: new Prisma.Decimal(0), totalAmount: new Prisma.Decimal(100000),
  cancellationReason: null, cancelledById: null, buyerConfirmedReceived: true, buyerConfirmedPaid: true,
  confirmedAt: now, shippedAt: now, deliveredAt: now, completedAt: now, cancelledAt: null,
  createdAt: now, updatedAt: now, expiresAt: null, checkoutRequestId: null,
  items: [], statusHistory: [], deliveryInfo: null, conversation: null, review,
};
function authenticate(viewer: User) {
  client.session.findUnique.mockResolvedValue({
    userId: viewer.id, revokedAt: null, expiresAt: new Date(Date.now() + 60000), user: viewer,
  });
  return `Bearer ${signAccessToken(viewer.id, "session")}`;
}

beforeEach(() => {
  vi.resetAllMocks();
  client.order.findUnique.mockResolvedValue(order);
  client.conversation.findFirst.mockResolvedValue(null);
  client.supportTicket.count.mockResolvedValue(0);
  client.$queryRaw.mockResolvedValue([]);
});

describe("order review participant access", () => {
  it.each([seller, { ...seller, status: "LOCKED" as const }])("lets the seller read the buyer's review without granting review submission", async (viewer) => {
    const response = await request(createApp()).get(`/api/v1/orders/${order.id}`)
      .set("Authorization", authenticate(viewer)).expect(200);
    expect(response.body.data.role).toBe("seller");
    expect(response.body.data.review).toMatchObject({
      can_review: false, existing: {
        id: review.id, order_id: order.id, rating: 4, comment: review.comment,
        reviewer: { id: buyer.id, name: buyer.fullName, avatar_url: null },
        reviewed_user_id: seller.id,
      },
    });
    expect(response.body.data.review.existing.reviewer).toEqual({ id: buyer.id, name: buyer.fullName, avatar_url: null });
    expect(response.body.data.allowed_actions).not.toContain("review");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("keeps the submitted review available to its buyer", async () => {
    const response = await request(createApp()).get(`/api/v1/orders/${order.id}`)
      .set("Authorization", authenticate(buyer)).expect(200);
    expect(response.body.data.review.existing.reviewer.name).toBe(buyer.fullName);
    expect(response.body.data.review.can_review).toBe(false);
  });

  it("returns no review for a sale that has not been reviewed", async () => {
    client.order.findUnique.mockResolvedValue({ ...order, review: null });
    const response = await request(createApp()).get(`/api/v1/orders/${order.id}`)
      .set("Authorization", authenticate(seller)).expect(200);
    expect(response.body.data.review).toMatchObject({ can_review: false, existing: null });
  });

  it("does not disclose the order or review to a nonparticipant", async () => {
    const response = await request(createApp()).get(`/api/v1/orders/${order.id}`)
      .set("Authorization", authenticate(user("stranger", "Người ngoài"))).expect(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body).not.toHaveProperty("data");
    expect(client.supportTicket.count).not.toHaveBeenCalled();
  });

  it("still rejects a review submitted by the seller", async () => {
    const response = await request(createApp()).post(`/api/v1/orders/${order.id}/reviews`)
      .set("Authorization", authenticate(seller)).send({ rating: 5, comment: null }).expect(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(client.$transaction).not.toHaveBeenCalled();
  });
});
