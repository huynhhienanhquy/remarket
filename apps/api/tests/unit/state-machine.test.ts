import { describe, expect, it } from "vitest";
import type { SupportTicket } from "@prisma/client";
import {
  orderAllowedActions,
  supportAllowedActions,
} from "../../src/shared/dto-mappers.js";
import type { OrderRow } from "../../src/shared/dto-mappers.js";

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
