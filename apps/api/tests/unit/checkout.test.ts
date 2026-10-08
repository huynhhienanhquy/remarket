import { describe, expect, it } from "vitest";
import { normalizePayload } from "../../src/routes/checkout.js";

const base = {
  items: [
    { product_id: "b", expected_price: "2000" },
    { product_id: "a", expected_price: "1000" },
  ],
  deliveries: [
    {
      seller_id: "seller-b",
      method: "COD" as const,
      recipient_name: "Nguyễn Văn A",
      recipient_phone: "0900000000",
      delivery_address: "1 Đường A, Quận B",
      expected_shipping_fee: "30000",
    },
  ],
};

describe("checkout canonical payload", () => {
  it("produces the same hash regardless of item order", () => {
    const first = normalizePayload(base);
    const second = normalizePayload({ ...base, items: [...base.items].reverse() });
    expect(first.hash).toBe(second.hash);
    expect(first.items.map((item) => item.product_id)).toEqual(["a", "b"]);
  });

  it("rejects duplicate products before opening a transaction", () => {
    expect(() => normalizePayload({ ...base, items: [base.items[0]!, base.items[0]!] })).toThrow(
      "Có sản phẩm bị lặp",
    );
  });
});
