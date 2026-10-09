import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartPage } from "@/pages/CartPage/CartPage";
import { httpContext } from "@/tests/http-context";
import { member, product, seller } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
beforeEach(() => { context = httpContext(member); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("cart selection through the HTTP adapter", () => {
  it("sends only available items to checkout", async () => {
    const item = { product_id: product.id, title: product.title, price: product.price, image_url: null,
      condition: "GOOD", status: "ACTIVE", province_label: "Hà Nội", available: true, unavailable_reason: null };
    context.reply("GET", "/cart", { groups: [{ seller, items: [item, { ...item, product_id: "sold-test", title: "Món đã bán", available: false, unavailable_reason: "Đã bán" }] }], total_items: 2 });
    harness.show(<CartPage />, "/cart");
    await userEvent.click(await screen.findByRole("button", { name: "Tiến hành đặt hàng (1)" }));
    expect(await screen.findByRole("heading", { name: "Checkout ?items=" + product.id })).toBeInTheDocument();
  });

  it("refreshes the cart after removal and renders its existing empty state", async () => {
    context.reply("GET", "/cart", { groups: [{ seller, items: [{ product_id: product.id, title: product.title,
      price: product.price, image_url: null, condition: "GOOD", status: "ACTIVE", available: true, unavailable_reason: null }] }], total_items: 1 });
    context.on("DELETE", `/cart/items/${product.id}`, () => { context.reply("GET", "/cart", { groups: [], total_items: 0 }); return {}; });
    harness.show(<CartPage />, "/cart");
    await userEvent.click(await screen.findByRole("button", { name: `Xóa ${product.title} khỏi giỏ hàng` }));
    expect(await screen.findByText("Giỏ hàng trống")).toBeInTheDocument();
    await waitFor(() => expect(context.requests("DELETE", `/cart/items/${product.id}`)).toHaveLength(1));
  });
});
