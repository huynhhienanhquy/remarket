import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FavoritesPage } from "@/pages/FavoritesPage/FavoritesPage";
import { httpContext, page } from "@/tests/http-context";
import { member, product } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
const show = harness.show;
beforeEach(() => { context = httpContext({ ...member }); context.reply("GET", "/products/" + product.id, product); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("member workflows through the HTTP adapter", () => {
it("removes a hidden saved item without revealing its title", async () => {
    context.reply("GET", "/favorites", page([{ ...product, title: "", price: "0", images: [], is_hidden: true, is_favorited: true }]));
    context.on("DELETE", "/favorites/" + product.id, () => {
      context.reply("GET", "/favorites", page([])); return {};
    });
    show(<FavoritesPage />, "/favorites");
    await screen.findByText("Tin đăng không còn khả dụng");
    expect(screen.queryByText(product.title)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Bỏ lưu" }));
    expect(await screen.findByText("Bạn chưa lưu món đồ nào")).toBeInTheDocument();
    expect(context.requests("DELETE", "/favorites/" + product.id)).toHaveLength(1);
  });
});
