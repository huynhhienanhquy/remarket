import { screen, waitFor, within } from "@testing-library/react";
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
  it("submits the direct purchase using the product details without loading the cart", async () => {
    context.reply("POST", "/checkout", {
      checkout_request_id: "checkout-test",
      orders: [{ id: "order-test", code: "RM-TEST", role: "buyer", counterparty: seller,
        status: "PENDING", delivery_method: "COD", items: [], total_amount: "130000", created_at: "2026-10-10T00:00:00.000Z", expires_at: null }],
    });

    show(<CheckoutPage />, `/checkout?product_id=${product.id}`, "/checkout");
    expect(await screen.findByText(product.title)).toBeInTheDocument();
    expect(await screen.findByLabelText("Phí giao hàng")).toHaveValue(product.shipping_fee);
    const summary = within(screen.getByRole("region", { name: "Xác nhận đơn hàng" }));
    expect(summary.getByText("30.000 ₫")).toBeInTheDocument();
    expect(summary.getByText("Tổng tiền đơn hàng")).toBeInTheDocument();
    expect(summary.getByText("130.000 ₫")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quay lại sản phẩm/ })).toHaveAttribute("href", `/products/${product.id}`);
    await userEvent.click(screen.getByRole("button", { name: "Đặt hàng" }));

    expect(await screen.findByRole("heading", { name: "Đơn mua đã tạo" })).toBeInTheDocument();
    expect(context.requests("GET", "/cart")).toHaveLength(0);
    expect(context.requests("POST", "/cart/items")).toHaveLength(0);
    expect(context.requests("POST", "/checkout")[0]?.body).toEqual({
      items: [{ product_id: product.id, expected_price: product.price }],
      deliveries: [{ seller_id: seller.id, method: "COD", expected_shipping_fee: product.shipping_fee,
        recipient_name: member.full_name, recipient_phone: member.phone, delivery_address: member.default_address }],
    });
  });

  it("totals shipping for selected products by seller and updates when delivery changes", async () => {
    const item = {
      product_id: product.id, title: product.title, price: product.price, image_url: null,
      condition: "GOOD", status: "ACTIVE", province_label: "Hà Nội", available: true,
      unavailable_reason: null, delivery_method: "BOTH", shipping_fee: "30000",
    };
    const secondItem = { ...item, product_id: "second-product", shipping_fee: "40000" };
    const excludedItem = { ...item, product_id: "excluded-product", shipping_fee: "80000" };
    const otherSeller = { ...seller, id: "other-seller", name: "Người bán thứ hai" };
    const otherItem = { ...item, product_id: "other-product", delivery_method: "COD", shipping_fee: "15000" };
    context.reply("GET", "/cart", {
      groups: [{ seller, items: [item, secondItem, excludedItem] }, { seller: otherSeller, items: [otherItem] }],
      total_items: 4,
    });

    show(<CheckoutPage />, `/checkout?items=${item.product_id},${secondItem.product_id},${otherItem.product_id}`, "/checkout");
    const summary = within(await screen.findByRole("region", { name: "Xác nhận đơn hàng" }));
    expect(await summary.findByText("55.000 ₫")).toBeInTheDocument();
    expect(summary.getByText("355.000 ₫")).toBeInTheDocument();

    const meetup = screen.getAllByRole("radio", { name: "Gặp trực tiếp" }).find((radio) => !radio.hasAttribute("disabled"));
    expect(meetup).toBeDefined();
    await userEvent.click(meetup!);

    expect(summary.getByText("15.000 ₫")).toBeInTheDocument();
    expect(summary.getByText("315.000 ₫")).toBeInTheDocument();
  });

it("submits only the selected products and preserves the idempotency key on network retry", async () => {
    const item = {
      delivery_method: product.delivery_method, shipping_fee: product.shipping_fee,
      product_id: product.id, title: product.title, price: product.price, image_url: null,
      condition: "GOOD", status: "ACTIVE", province_label: "Hà Nội", available: true, unavailable_reason: null,
    };
    const secondItem = { ...item, product_id: "second-product", title: "Bàn làm việc", price: "200000" };
    const excluded = { ...item, product_id: "excluded-product", title: "Ghế làm việc" };
    context.reply("GET", "/cart", { groups: [{ seller, items: [item, secondItem, excluded] }], total_items: 3 });
    context.on("POST", "/checkout", () => {
      if (context.requests("POST", "/checkout").length === 1) throw new Error("Network unavailable");
      return { checkout_request_id: "checkout-test", orders: [{ id: "order-test", code: "RM-TEST", role: "buyer", counterparty: seller,
        status: "PENDING", delivery_method: "COD", items: [], total_amount: "130000", created_at: "2026-10-10T00:00:00.000Z", expires_at: null }] };
    });
    show(<CheckoutPage />, `/checkout?items=${product.id},${secondItem.product_id}`, "/checkout");
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
      items: [
        { product_id: product.id, expected_price: product.price },
        { product_id: secondItem.product_id, expected_price: secondItem.price },
      ],
      deliveries: [{ seller_id: seller.id, method: "COD", expected_shipping_fee: "30000",
        recipient_name: member.full_name, recipient_phone: member.phone, delivery_address: member.default_address }],
    });
  });
});
