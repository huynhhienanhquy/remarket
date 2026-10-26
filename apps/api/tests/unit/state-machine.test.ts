import { describe, expect, it } from "vitest";
import type { SupportTicket } from "@prisma/client";
import {
  orderAllowedActions,
  supportAllowedActions,
} from "../../src/shared/dto-mappers.js";
import type { OrderRow } from "../../src/shared/dto-mappers.js";
import { primaryOrderAction } from "@remarket/shared";

function order(overrides: Partial<OrderRow>): OrderRow {
  return {
    id: "order-1",
    buyerId: "buyer-1",
    sellerId: "seller-1",
    status: "SHIPPING",
    deliveryMethod: "COD",
    buyerConfirmedReceived: false,
    expiresAt: null,
    completedAt: null,
    ...overrides,
  } as OrderRow;
}

function ticket(status: SupportTicket["status"]): SupportTicket {
  return { id: "ticket-1", status } as SupportTicket;
}

describe("authoritative action projections", () => {
  it.each(["COD", "MEETUP"] as const)("lets the buyer cancel a confirmed %s order before delivery", (deliveryMethod) => {
    const actions = orderAllowedActions(
      order({ status: "CONFIRMED", deliveryMethod }),
      { id: "buyer-1", status: "ACTIVE" }, false, false,
    );
    expect(actions).toContain("cancel");
    expect(actions).not.toContain("deliver");
  });

  it("lets a COD seller declare a shipment delivered without claiming buyer receipt", () => {
    expect(
      orderAllowedActions(
        order({}),
        { id: "seller-1", status: "ACTIVE" },
        false,
        false,
      ),
    ).toContain("deliver");
  });

  it.each(["COD", "MEETUP"] as const)("keeps %s lifecycle actions exclusive to the correct participant", (deliveryMethod) => {
    for (const status of ["PENDING", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "CANCELLED"] as const) {
      const current = order({ status, deliveryMethod, completedAt: status === "COMPLETED" ? new Date() : null });
      const buyerActions = orderAllowedActions(current, { id: "buyer-1", status: "ACTIVE" }, false, false);
      const sellerActions = orderAllowedActions(current, { id: "seller-1", status: "ACTIVE" }, false, false);
      expect(buyerActions).not.toContain("confirm");
      expect(buyerActions).not.toContain("ship");
      expect(buyerActions).not.toContain("deliver");
      expect(buyerActions.includes("complete")).toBe(status === "DELIVERED");
      expect(sellerActions).not.toContain("complete");
      expect(sellerActions.includes("confirm")).toBe(status === "PENDING");
      expect(sellerActions.includes("ship")).toBe(status === "CONFIRMED" && deliveryMethod === "COD");
      expect(sellerActions.includes("deliver")).toBe(
        (status === "SHIPPING" && deliveryMethod === "COD") || (status === "CONFIRMED" && deliveryMethod === "MEETUP"),
      );
      const buyerPrimary = primaryOrderAction({ role: "buyer", status, delivery: deliveryMethod });
      const sellerPrimary = primaryOrderAction({ role: "seller", status, delivery: deliveryMethod });
      if (buyerPrimary) expect(buyerActions).toContain(buyerPrimary);
      if (sellerPrimary) expect(sellerActions).toContain(sellerPrimary);
    }
  });

  it("blocks completion while a support ticket is open", () => {
    expect(orderAllowedActions(order({ status: "DELIVERED" }), { id: "buyer-1", status: "ACTIVE" }, true, false)).not.toContain("complete");
  });

  it("lets an owner close a resolved support ticket", () => {
    expect(supportAllowedActions(ticket("RESOLVED"), false)).toEqual(["reply", "close"]);
  });

  it("offers admin reply and close actions until a support ticket is closed", () => {
    expect(supportAllowedActions(ticket("IN_PROGRESS"), true)).toEqual([
      "reply",
      "resolve",
      "close",
    ]);
    expect(supportAllowedActions(ticket("CLOSED"), true)).toEqual([]);
  });
});
