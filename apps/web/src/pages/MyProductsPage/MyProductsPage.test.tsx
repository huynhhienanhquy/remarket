import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyProductsPage } from "@/pages/MyProductsPage/MyProductsPage";
import { httpContext, page } from "@/tests/http-context";
import { member, product } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
beforeEach(() => { context = httpContext(member); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("own listing actions and pagination", () => {
  it("requires confirmation before deleting and returns to the previous page after its last item", async () => {
    context.reply("GET", "/account/products", { ...page([{ ...product, allowed_actions: ["view", "delete"] }]), meta: { page: 2, page_size: 12, total: 13, total_pages: 2 } });
    context.on("DELETE", `/products/${product.id}`, () => { context.reply("GET", "/account/products", page([])); return {}; });
    harness.show(<MyProductsPage />, "/account/products?page=2");
    await userEvent.click(await screen.findByRole("button", { name: "Xóa" }));
    expect(context.requests("DELETE", `/products/${product.id}`)).toHaveLength(0);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: /^Xóa$/ }));
    await waitFor(() => expect(context.requests("DELETE", `/products/${product.id}`)).toHaveLength(1));
    await waitFor(() => expect(context.requests("GET", "/account/products").at(-1)?.url.searchParams.get("page")).toBe("1"));
  });
});
