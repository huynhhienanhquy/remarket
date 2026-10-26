import { beforeEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => ({
  user: { findUnique: vi.fn() }, order: { findUnique: vi.fn(), updateMany: vi.fn() },
  product: { findMany: vi.fn(), updateMany: vi.fn() }, orderDeliveryInfo: { update: vi.fn() },
  supportTicket: { count: vi.fn() }, orderStatusHistory: { create: vi.fn() },
  notification: { create: vi.fn() }, outboxDedupeKey: { createManyAndReturn: vi.fn() }, outboxEvent: { createMany: vi.fn() },
  $queryRaw: vi.fn(), $transaction: vi.fn(),
}));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { applyOrderAction, type OrderActionInput } from "../../src/services/order-actions.js";

const seller = { id: "seller", email: "seller@example.test", fullName: "Seller", status: "ACTIVE" as const, role: "USER" as const, emailVerifiedAt: new Date() };
const buyer = { ...seller, id: "buyer", fullName: "Buyer" };
const order = {
  id: "order", code: "RM-123", buyerId: buyer.id, sellerId: seller.id, status: "SHIPPING",
  deliveryMethod: "COD", version: 3, expiresAt: null, buyerConfirmedReceived: false, buyerConfirmedPaid: false,
  items: [{ productId: "product" }],
};

beforeEach(() => {
  vi.resetAllMocks();
  client.$transaction.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));
  client.user.findUnique.mockResolvedValue({ status: "ACTIVE" });
  client.order.findUnique.mockResolvedValue(order);
  client.order.updateMany.mockResolvedValue({ count: 1 });
  client.product.updateMany.mockResolvedValue({ count: 1 });
  client.supportTicket.count.mockResolvedValue(0);
  client.notification.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "notification", ...data }));
  client.outboxDedupeKey.createManyAndReturn.mockImplementation(async ({ data }: { data: unknown[] }) => data);
});

describe("order lifecycle authorization", () => {
  it.each([undefined, "  GHTK  "])("generates and persists a random tracking code with carrier %s", async (carrier) => {
    client.order.findUnique.mockResolvedValue({ ...order, status: "CONFIRMED" });
    await applyOrderAction(order.id, { action: "ship", expected_version: 3, carrier }, seller);
    const saved = client.orderDeliveryInfo.update.mock.calls[0]?.[0];
    expect(saved).toEqual({
      where: { orderId: order.id },
      data: { ...(carrier ? { carrier: "GHTK" } : {}), trackingCode: expect.stringMatching(/^RM[A-F0-9]{24}$/) },
    });
    expect(client.notification.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: "ORDER_SHIPPED", content: `Đơn #${order.code} đã được gửi (mã ${saved.data.trackingCode}).` }),
    }));

    client.order.findUnique.mockResolvedValue({ ...order, id: "other-order", status: "CONFIRMED" });
    await applyOrderAction("other-order", { action: "ship", expected_version: 3 }, seller);
    expect(client.orderDeliveryInfo.update.mock.calls[1]?.[0].data.trackingCode).not.toBe(saved.data.trackingCode);
  });

  it("does not replace the tracking code when shipment is submitted again", async () => {
    await expect(applyOrderAction(order.id, { action: "ship", expected_version: 3 }, seller))
      .rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    expect(client.orderDeliveryInfo.update).not.toHaveBeenCalled();
  });

  it("does not save a tracking code for a stale shipment request", async () => {
    client.order.findUnique.mockResolvedValue({ ...order, status: "CONFIRMED", version: 4 });
    client.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(applyOrderAction(order.id, { action: "ship", expected_version: 3 }, seller))
      .rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(client.orderDeliveryInfo.update).not.toHaveBeenCalled();
    expect(client.notification.create).not.toHaveBeenCalled();
  });

  it("does not announce shipment when saving the tracking code fails", async () => {
    client.order.findUnique.mockResolvedValue({ ...order, status: "CONFIRMED" });
    client.orderDeliveryInfo.update.mockRejectedValue(new Error("Delivery update failed"));
    await expect(applyOrderAction(order.id, { action: "ship", expected_version: 3 }, seller))
      .rejects.toThrow("Delivery update failed");
    expect(client.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(client.notification.create).not.toHaveBeenCalled();
  });

  it.each([
    ["confirm", "PENDING", "COD"],
    ["ship", "CONFIRMED", "COD"],
    ["deliver", "SHIPPING", "COD"],
    ["deliver", "CONFIRMED", "MEETUP"],
  ] as const)("rejects buyer %s on a %s %s order without changing data", async (action, status, deliveryMethod) => {
    client.order.findUnique.mockResolvedValue({ ...order, status, deliveryMethod });
    await expect(applyOrderAction(order.id, {
      action, expected_version: 3, buyer_confirmed_received: true, buyer_confirmed_paid: true,
    }, buyer)).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    expect(client.order.updateMany).not.toHaveBeenCalled();
    expect(client.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(client.notification.create).not.toHaveBeenCalled();
  });

  it.each([["SHIPPING", "COD"], ["CONFIRMED", "MEETUP"]] as const)("lets the seller record delivery for %s %s without confirming buyer receipt/payment", async (status, deliveryMethod) => {
    client.order.findUnique.mockResolvedValue({ ...order, status, deliveryMethod });
    await applyOrderAction(order.id, {
      action: "deliver", expected_version: 3, buyer_confirmed_received: true, buyer_confirmed_paid: true,
    }, seller);
    const call = client.order.updateMany.mock.calls[0];
    if (!call) throw new Error("Expected a delivery update");
    const update = call[0];
    expect(update).toMatchObject({ where: { status: { in: [status] }, version: 3 }, data: { status: "DELIVERED", deliveredAt: expect.any(Date), version: { increment: 1 } } });
    expect(update.data).not.toHaveProperty("buyerConfirmedReceived");
    expect(update.data).not.toHaveProperty("buyerConfirmedPaid");
    expect(client.product.updateMany).not.toHaveBeenCalled();
    expect(client.orderStatusHistory.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actorId: seller.id, toStatus: "DELIVERED" }) }));
    expect(client.notification.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ userId: buyer.id, type: "ORDER_DELIVERED" }) }));
  });

  it("rejects seller completion even when buyer confirmations are provided", async () => {
    client.order.findUnique.mockResolvedValue({ ...order, status: "DELIVERED" });
    await expect(applyOrderAction(order.id, { action: "complete", expected_version: 3, buyer_confirmed_received: true, buyer_confirmed_paid: true }, seller))
      .rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    expect(client.order.updateMany).not.toHaveBeenCalled();
  });

  it.each([["CONFIRMED", "COD"], ["PENDING", "MEETUP"], ["DELIVERED", "COD"]] as const)("rejects seller delivery from %s %s", async (status, deliveryMethod) => {
    client.order.findUnique.mockResolvedValue({ ...order, status, deliveryMethod });
    await expect(applyOrderAction(order.id, { action: "deliver", expected_version: 3 }, seller)).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    expect(client.order.updateMany).not.toHaveBeenCalled();
  });

  it("does not record delivery history when the order version has changed", async () => {
    client.order.updateMany.mockResolvedValue({ count: 0 });
    client.order.findUnique.mockResolvedValue({ ...order, version: 4 });
    await expect(applyOrderAction(order.id, { action: "deliver", expected_version: 3 }, seller)).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    expect(client.orderStatusHistory.create).not.toHaveBeenCalled();
    expect(client.notification.create).not.toHaveBeenCalled();
  });

  it.each(["CONFIRMED", "SHIPPING"] as const)("prevents buyer completion before seller delivery at %s", async (status) => {
    client.order.findUnique.mockResolvedValue({ ...order, status });
    await expect(applyOrderAction(order.id, { action: "complete", expected_version: 3, buyer_confirmed_received: true, buyer_confirmed_paid: true }, buyer)).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    expect(client.order.updateMany).not.toHaveBeenCalled();
  });

  it("prevents buyer completion with an open support ticket", async () => {
    client.order.findUnique.mockResolvedValue({ ...order, status: "DELIVERED" });
    client.supportTicket.count.mockResolvedValue(1);
    await expect(applyOrderAction(order.id, { action: "complete", expected_version: 3, buyer_confirmed_received: true, buyer_confirmed_paid: true }, buyer)).rejects.toMatchObject({ code: "INVALID_ORDER_TRANSITION" });
    expect(client.order.updateMany).not.toHaveBeenCalled();
  });

  it("lets only the buyer finish a delivered order and marks the product sold", async () => {
    client.order.findUnique.mockResolvedValue({ ...order, status: "DELIVERED" });
    await applyOrderAction(order.id, { action: "complete", expected_version: 3, buyer_confirmed_received: true, buyer_confirmed_paid: true }, buyer);
    expect(client.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED", buyerConfirmedReceived: true, buyerConfirmedPaid: true }) }));
    expect(client.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "SOLD" }) }));
  });

  it.each([
    { buyer_confirmed_received: false, buyer_confirmed_paid: true },
    { buyer_confirmed_received: true, buyer_confirmed_paid: false },
  ])("requires buyer confirmation of both receipt and payment: %j", async (checks) => {
    client.order.findUnique.mockResolvedValue({ ...order, status: "DELIVERED" });
    await expect(applyOrderAction(order.id, { action: "complete", expected_version: 3, ...checks }, buyer)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(client.order.updateMany).not.toHaveBeenCalled();
  });

  it.each(["confirm", "ship", "deliver", "complete"] as const)("does not expose %s to a nonparticipant", async (action: OrderActionInput["action"]) => {
    await expect(applyOrderAction(order.id, { action, expected_version: 3 }, { ...buyer, id: "outsider" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(client.order.updateMany).not.toHaveBeenCalled();
  });
});
