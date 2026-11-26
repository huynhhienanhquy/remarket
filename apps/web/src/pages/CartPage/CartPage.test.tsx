import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useParams } from "react-router-dom";
import { formatVnd } from "@remarket/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CartPage } from "@/pages/CartPage/CartPage";
import { httpContext } from "@/tests/http-context";
import { member, product, seller, timestamp } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();

function CartOrConversation() {
  const { id } = useParams();
  return id ? <h1>Phòng chat {id}</h1> : <CartPage />;
}

beforeEach(() => { context = httpContext(member); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("cart selection through the HTTP adapter", () => {
  it("updates the subtotal and sends only the selected available items to checkout", async () => {
    const item = {delivery_method: "BOTH", shipping_fee: "0",  product_id: product.id, title: product.title, price: product.price, image_url: null,
      condition: "GOOD", status: "ACTIVE", province_label: "Hà Nội", available: true, unavailable_reason: null };
    const desk = { ...item, product_id: "desk-test", title: "Bàn làm việc", price: "200000" };
    const chair = { ...item, product_id: "chair-test", title: "Ghế làm việc", price: "300000" };
    const sold = { ...item, product_id: "sold-test", title: "Món đã bán", available: false, unavailable_reason: "Đã bán" };
    context.reply("GET", "/cart", {
      groups: [{ seller, items: [item, desk, sold] }, { seller: { ...seller, id: "other-seller", name: "Người bán thứ hai" }, items: [chair] }],
      total_items: 4,
    });
    harness.show(<CartPage />, "/cart");
    const user = userEvent.setup();
    const selectAll = await screen.findByRole("checkbox", { name: "Chọn tất cả" });
    const summary = within(screen.getByRole("heading", { name: "Thông tin đặt hàng" }).parentElement!);
    expect(selectAll).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Chọn Món đã bán" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Nhắn tin về Món đã bán" })).toBeDisabled();
    expect(summary.getByText(formatVnd("600000"))).toBeInTheDocument();

    await user.click(selectAll);
    expect(summary.getByRole("button", { name: "Chọn món đồ để tiếp tục" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Chọn Bàn làm việc" }));
    expect(selectAll).toBePartiallyChecked();
    expect(summary.getByRole("button", { name: "Tiến hành đặt hàng (1)" })).toBeEnabled();
    expect(summary.getByText(formatVnd("200000"))).toBeInTheDocument();

    await user.click(selectAll);
    expect(summary.getByRole("button", { name: "Tiến hành đặt hàng (3)" })).toBeEnabled();
    await user.click(screen.getByRole("checkbox", { name: `Chọn ${item.title}` }));
    expect(summary.getByText(formatVnd("500000"))).toBeInTheDocument();
    await user.click(summary.getByRole("button", { name: "Tiến hành đặt hàng (2)" }));
    const params = new URLSearchParams({ items: `${desk.product_id},${chair.product_id}` });
    expect(await screen.findByRole("heading", { name: `Checkout ?${params}` })).toBeInTheDocument();
  });

  it("opens the seller conversation for the product selected from a group", async () => {
    const item = {
      delivery_method: "BOTH", shipping_fee: "0", product_id: product.id, title: product.title, price: product.price,
      image_url: null, condition: "GOOD", status: "ACTIVE", province_label: "Hà Nội", available: true, unavailable_reason: null,
    };
    const second = { ...item, product_id: "second-product", title: "Bàn làm việc" };
    context.reply("GET", "/cart", { groups: [{ seller, items: [item, second] }], total_items: 2 });
    context.reply("POST", "/conversations", {
      id: "second-conversation", counterparty: seller, product: { id: second.product_id, ...second },
      last_message: null, unread_count: 0, updated_at: timestamp,
    });

    harness.show(<CartOrConversation />, "/cart", "/:section/:id?");
    await userEvent.click(await screen.findByRole("button", { name: "Nhắn tin về Bàn làm việc" }));
    expect(await screen.findByRole("heading", { name: "Phòng chat second-conversation" })).toBeInTheDocument();
    expect(context.requests("POST", "/conversations").map(({ body }) => body)).toEqual([{ product_id: second.product_id }]);
  });

  it("refreshes the cart after removal and renders its existing empty state", async () => {
    context.reply("GET", "/cart", { groups: [{ seller, items: [{delivery_method: "BOTH", shipping_fee: "0",  product_id: product.id, title: product.title,
      price: product.price, image_url: null, condition: "GOOD", status: "ACTIVE", province_label: null, available: true, unavailable_reason: null }] }], total_items: 1 });
    context.on("DELETE", `/cart/items/${product.id}`, () => { context.reply("GET", "/cart", { groups: [], total_items: 0 }); return { groups: [], total_items: 0 }; });
    harness.show(<CartPage />, "/cart");
    await userEvent.click(await screen.findByRole("button", { name: `Xóa ${product.title} khỏi giỏ hàng` }));
    expect(await screen.findByText("Giỏ hàng trống")).toBeInTheDocument();
    await waitFor(() => expect(context.requests("DELETE", `/cart/items/${product.id}`)).toHaveLength(1));
  });
});
