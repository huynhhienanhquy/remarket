import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  user: { findUnique: vi.fn() }, order: { findUnique: vi.fn(), updateMany: vi.fn() },
  product: { findMany: vi.fn(), updateMany: vi.fn() }, orderStatusHistory: { create: vi.fn() },
  notification: { createManyAndReturn: vi.fn() }, outboxDedupeKey: { createManyAndReturn: vi.fn() }, outboxEvent: { createMany: vi.fn() },
  $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { applyOrderAction } from "../../src/services/order-actions.js";

const actor = { id: "seller", email: "seller@example.test", fullName: "Seller", status: "ACTIVE" as const, role: "USER" as const, emailVerifiedAt: new Date() };
const order = { id: "order", code: "RM-123", buyerId: "buyer", sellerId: actor.id, status: "PENDING", version: 1, expiresAt: null, items: [{ productId: "product" }] };
const product = { id: "product", categoryId: "category", status: "RESERVED", reservedOrderId: order.id, isBlocked: false, deletedAt: null, seller: actor };
let committed = false;
beforeEach(() => {
  vi.resetAllMocks(); committed = false;
  client.$transaction.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => {
    const result = await callback(client); committed = true; return result;
  });
  client.user.findUnique.mockResolvedValue(actor);
  client.order.findUnique.mockResolvedValue(order);
  client.order.updateMany.mockResolvedValue({ count: 1 });
  client.product.findMany.mockResolvedValue([product]);
  client.product.updateMany.mockResolvedValue({ count: 1 });
  client.$queryRaw.mockResolvedValue([{ id: "category", parentId: null, status: "INACTIVE", isLeaf: true }]);
  client.notification.createManyAndReturn.mockResolvedValue([]);
  client.outboxDedupeKey.createManyAndReturn.mockImplementation(async ({ data }: { data: unknown[] }) => data);
});

describe("unavailable order confirmation", () => {
  it("commits cancellation and inventory release before returning PRODUCT_NOT_AVAILABLE", async () => {
    await expect(applyOrderAction(order.id, { action: "confirm", expected_version: 1 }, actor))
      .rejects.toMatchObject({ code: "PRODUCT_NOT_AVAILABLE" });
    expect(committed).toBe(true);
    expect(client.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "CANCELLED" }) }));
    expect(client.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "INACTIVE", reservedOrderId: null }) }));
    expect(client.orderStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(client.notification.createManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([
      expect.objectContaining({ userId: "buyer", type: "ORDER_CANCELLED" }),
      expect.objectContaining({ userId: "seller", type: "ORDER_CANCELLED" }),
    ]) }));
  });

  it("does not mutate an order based on a stale version", async () => {
    await expect(applyOrderAction(order.id, { action: "confirm", expected_version: 2 }, actor))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(committed).toBe(false);
    expect(client.order.updateMany).not.toHaveBeenCalled();
    expect(client.product.updateMany).not.toHaveBeenCalled();
  });

  it("rolls back the cancellation if its durable event cannot be written", async () => {
    client.outboxEvent.createMany.mockRejectedValue(new Error("Database unavailable"));
    await expect(applyOrderAction(order.id, { action: "confirm", expected_version: 1 }, actor)).rejects.toThrow("Database unavailable");
    expect(committed).toBe(false);
  });
});
