import { describe, expect, it } from "vitest";
import type { CartView } from "@remarket/shared";
import { checkoutSelection, selectedCart } from "./checkout-selection";
import { buildCheckoutPayload } from "./checkout-payload";

const first = "00000000-0000-0000-0000-000000000001";
const second = "00000000-0000-0000-0000-000000000002";
const third = "00000000-0000-0000-0000-000000000003";
const user = {
  full_name: "Người mua",
  phone: "0901234567",
  default_address: "12 Đường A",
};
const seller = {
  id: "seller",
  name: "Người bán",
  avatar_url: null,
  province_code: null,
  province_label: null,
  joined_at: "2026-10-01T00:00:00Z",
  rating: null,
  review_count: 0,
  completed_sales_count: 0,
};
const cart: CartView = {
  total_items: 3,
  groups: [
    {
      seller,
      items: [first, second, third].map((product_id) => ({
        product_id,
        title: product_id,
        price: "100000",
        image_url: null,
        condition: "GOOD",
        status: "ACTIVE",
        province_label: null,
        delivery_method: "COD",
        shipping_fee: "10000",
        available: true,
        unavailable_reason: null,
      })),
    },
  ],
};

describe("cart to checkout selection", () => {
  it("submits exactly the cart items selected before navigation", () => {
    const selection = checkoutSelection(`${first},${third},${first}`);
    const selected = selectedCart(cart, selection);
    expect(selected.total_items).toBe(2);
    expect(
      buildCheckoutPayload(selected, [], {}, user).items.map(
        (item) => item.product_id,
      ),
    ).toEqual([first, third]);
    expect(cart.total_items).toBe(3);
  });
  it("never expands an invalid or missing item selection to the full cart", () => {
    for (const input of [
      "",
      "invalid",
      `${first},invalid`,
      [first],
      Array(51).fill(first).join(","),
    ]) {
      const selected = selectedCart(cart, checkoutSelection(input));
      expect(selected.total_items).toBe(0);
      expect(() => buildCheckoutPayload(selected, [], {}, user)).toThrow(
        "Chưa chọn",
      );
    }
    expect(selectedCart(cart, checkoutSelection(undefined))).toBe(cart);
    expect(
      selectedCart(cart, ["00000000-0000-0000-0000-000000000099"]).groups,
    ).toEqual([]);
  });
  it("revalidates availability when a selected item becomes unavailable", () => {
    const changed: CartView = {
      ...cart,
      groups: [
        {
          seller,
          items: cart.groups[0]!.items.map((item) => ({
            ...item,
            unavailable_reason:
              item.product_id === first ? "Đã được giữ chỗ" : null,
          })),
        },
      ],
    };
    expect(
      buildCheckoutPayload(
        selectedCart(changed, [first, second]),
        [],
        {},
        user,
      ).items.map((item) => item.product_id),
    ).toEqual([second]);
  });
});
