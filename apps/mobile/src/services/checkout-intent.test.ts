import { describe, expect, it } from "vitest";
import { CheckoutIntent } from "./checkout-intent";
describe("uncertain checkout", () => {
  it("keeps the original payload and idempotency key after the form changes", () => {
    let id = 0;
    const intent = new CheckoutIntent(() => `key-${++id}`);
    const original = {
      items: [{ product_id: "product", expected_price: "1000" }],
      deliveries: [],
    };
    const first = intent.getOrCreate(original);
    original.items[0]!.expected_price = "2000";
    expect(intent.getOrCreate(original)).toBe(first);
    expect(first.payload.items[0]!.expected_price).toBe("1000");
    expect(first.key).toBe("key-1");
    // A cart refresh may be empty after a committed request whose response was lost.
    expect(intent.current).toBe(first);
    expect(intent.current?.payload.items).toEqual([
      { product_id: "product", expected_price: "1000" },
    ]);
    intent.clear();
    expect(intent.current).toBeNull();
    expect(intent.getOrCreate(original).key).toBe("key-2");
  });
});
