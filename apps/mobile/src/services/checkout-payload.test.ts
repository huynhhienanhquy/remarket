import { describe, expect, it } from "vitest";
import type { CartItemView, CartView, SellerSummary } from "@remarket/shared";
import { buildCheckoutPayload } from "./checkout-payload";

const user = {
  full_name: "Người mua",
  phone: "0901234567",
  default_address: "12 Đường A, Hà Nội",
};
function seller(id: string): SellerSummary {
  return {
    id,
    name: `Người bán ${id}`,
    avatar_url: null,
    province_code: null,
    province_label: null,
    joined_at: "2026-10-01T00:00:00Z",
    rating: null,
    review_count: 0,
    completed_sales_count: 0,
  };
}
function item(
  product_id: string,
  shipping_fee = "0",
  delivery_method: CartItemView["delivery_method"] = "BOTH",
): CartItemView {
  return {
    product_id,
    title: product_id,
    price: "100000",
    image_url: null,
    condition: "GOOD",
    status: "ACTIVE",
    province_label: "Hà Nội",
    delivery_method,
    shipping_fee,
    available: true,
    unavailable_reason: null,
  };
}

describe("checkout parity", () => {
  it("groups partial selections by seller and uses the maximum COD fee per seller", () => {
    const cart: CartView = {
      total_items: 5,
      groups: [
        {
          seller: seller("A"),
          items: [
            item("one", "15000"),
            item("two", "30000"),
            item("excluded", "90000"),
          ],
        },
        {
          seller: seller("B"),
          items: [
            item("three", "10000"),
            { ...item("unavailable"), available: false },
          ],
        },
      ],
    };
    const payload = buildCheckoutPayload(cart, ["excluded"], {}, user);
    expect(payload.items.map((entry) => entry.product_id)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(
      payload.deliveries.map((delivery) => [
        delivery.seller_id,
        delivery.expected_shipping_fee,
      ]),
    ).toEqual([
      ["A", "30000"],
      ["B", "10000"],
    ]);
    expect(
      payload.items.every((entry) => entry.expected_price === "100000"),
    ).toBe(true);
  });
  it("makes meetup free and trims contact details without changing expected prices", () => {
    const cart: CartView = {
      total_items: 1,
      groups: [{ seller: seller("A"), items: [item("one", "30000")] }],
    };
    const payload = buildCheckoutPayload(
      cart,
      [],
      {
        A: {
          method: "MEETUP",
          recipient_name: " Người nhận ",
          recipient_phone: " 0901234567 ",
          delivery_address: " Quán cà phê A ",
        },
      },
      user,
    );
    expect(payload.deliveries[0]).toMatchObject({
      method: "MEETUP",
      expected_shipping_fee: "0",
      recipient_name: "Người nhận",
      recipient_phone: "0901234567",
      delivery_address: "Quán cà phê A",
    });
  });
  it("rejects incompatible delivery methods before creating an idempotent request", () => {
    const cart: CartView = {
      total_items: 2,
      groups: [
        {
          seller: seller("A"),
          items: [item("cod", "10000", "COD"), item("meetup", "0", "MEETUP")],
        },
      ],
    };
    expect(() => buildCheckoutPayload(cart, [], {}, user)).toThrow(
      "chung hình thức giao nhận",
    );
    expect(
      buildCheckoutPayload(cart, ["cod"], {}, user).deliveries[0]?.method,
    ).toBe("MEETUP");
  });
  it("rejects blank overrides, invalid phone and empty selection", () => {
    const cart: CartView = {
      total_items: 1,
      groups: [{ seller: seller("A"), items: [item("one")] }],
    };
    expect(() =>
      buildCheckoutPayload(cart, [], { A: { recipient_name: " " } }, user),
    ).toThrow();
    expect(() =>
      buildCheckoutPayload(cart, [], { A: { recipient_phone: "abc" } }, user),
    ).toThrow();
    expect(() =>
      buildCheckoutPayload(cart, [], { A: { delivery_address: "" } }, user),
    ).toThrow();
    expect(() => buildCheckoutPayload(cart, ["one"], {}, user)).toThrow(
      "Chưa chọn",
    );
  });
});
