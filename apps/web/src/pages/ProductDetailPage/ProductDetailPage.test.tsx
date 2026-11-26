import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProductDetailPage } from "@/pages/ProductDetailPage/ProductDetailPage";
import { httpContext } from "@/tests/http-context";
import { member, product } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
  it.each([0, 1])("opens direct checkout without adding to the cart from buy button %i", async (index) => {
    show(<ProductDetailPage />, "/products/" + product.id, "/products/:id");
    const buttons = await screen.findAllByRole("button", { name: "Mua ngay" });
    await userEvent.click(buttons[index]!);
    expect(await screen.findByRole("heading", { name: "Checkout ?product_id=" + product.id })).toBeInTheDocument();
    expect(context.requests("POST", "/cart/items")).toHaveLength(0);
  });

  it("adds the viewed product when the cart button is clicked", async () => {
    context.reply("POST", "/cart/items", { groups: [], total_items: 0 });
    show(<ProductDetailPage />, "/products/" + product.id, "/products/:id");
    await userEvent.click(await screen.findByRole("button", { name: "Thêm vào giỏ" }));
    expect(await screen.findByText("Đã thêm vào giỏ hàng")).toBeInTheDocument();
    const requests = context.requests("POST", "/cart/items");
    expect(requests).toHaveLength(1);
    expect(requests[0]?.body).toEqual({ product_id: product.id });
  });
it("asks a guest to log in before adding an item to the cart", async () => {
    context.viewer = null;
    show(<ProductDetailPage />, "/products/" + product.id, "/products/:id");
    await waitFor(() => expect(screen.getByRole("button", { name: "Thêm vào giỏ" })).not.toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: "Thêm vào giỏ" }));
    expect(await screen.findByRole("heading", { name: "Đăng nhập để tiếp tục" })).toBeInTheDocument();
    expect(context.requests("POST", "/cart/items")).toHaveLength(0);
  });
});
