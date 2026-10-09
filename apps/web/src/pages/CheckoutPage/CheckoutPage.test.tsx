import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckoutPage } from "@/pages/CheckoutPage/CheckoutPage";
import { httpContext } from "@/tests/http-context";
import { member, product, seller } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
it("submits canonical checkout fields and preserves the idempotency key on network retry", async () => {
    context.reply("GET", "/cart", { groups: [{ seller, items: [{
      product_id: product.id, title: product.title, price: product.price, image_url: null,
      condition: "GOOD", status: "ACTIVE", province_label: "Hà Nội", available: true, unavailable_reason: null,
    }] }], total_items: 1 });
    context.on("POST", "/checkout", () => {
      if (context.requests("POST", "/checkout").length === 1) throw new Error("Network unavailable");
      return { checkout_request_id: "checkout-test", orders: [{ id: "order-test" }] };
    });
    show(<CheckoutPage />, "/checkout?items=" + product.id, "/checkout");
    await waitFor(() => expect(screen.getByLabelText("Phí giao hàng")).toHaveValue("30000"));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Đặt hàng" }));
    await waitFor(() => expect(context.requests("POST", "/checkout")).toHaveLength(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Đặt hàng" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Đặt hàng" }));
    expect(await screen.findByRole("heading", { name: "Đơn mua đã tạo" })).toBeInTheDocument();
    const [first, second] = context.requests("POST", "/checkout");
    expect(first?.headers.get("Idempotency-Key")).toBeTruthy();
    expect(second?.headers.get("Idempotency-Key")).toBe(first?.headers.get("Idempotency-Key"));
    expect(second?.body).toEqual({
      items: [{ product_id: product.id, expected_price: product.price }],
      deliveries: [{ seller_id: seller.id, method: "COD", expected_shipping_fee: "30000",
        recipient_name: member.full_name, recipient_phone: member.phone, delivery_address: member.default_address }],
    });
  });
});
