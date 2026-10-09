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
it("buys only the viewed product, not every existing item in the cart", async () => {
    context.reply("POST", "/cart/items", {});
    show(<ProductDetailPage />, "/products/" + product.id, "/products/:id");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Mua ngay" })[0]).not.toBeDisabled());
    await userEvent.click(screen.getAllByRole("button", { name: "Mua ngay" })[0]!);
    expect(await screen.findByRole("heading", { name: "Checkout ?items=" + product.id })).toBeInTheDocument();
    expect(context.requests("POST", "/cart/items")[0]?.body).toEqual({ product_id: product.id });
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
