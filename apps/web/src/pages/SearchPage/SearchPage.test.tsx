import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SearchPage } from "@/pages/SearchPage/SearchPage";
import { failure, httpContext, page } from "@/tests/http-context";
import { member, product } from "@/tests/test-data";
import { createMemberPageHarness } from "@/tests/renderMemberPage";

let context: ReturnType<typeof httpContext>;
const harness = createMemberPageHarness();
beforeEach(() => { context = httpContext(member); context.reply("GET", "/products", page([product])); });
afterEach(() => { harness.cleanup(); vi.unstubAllGlobals(); });

describe("catalogue URL state through the HTTP adapter", () => {
  it("retains other filters while sorting or removing the price range, and resets the page", async () => {
    harness.show(<SearchPage />, "/products?q=den&min_price=100&max_price=200&page=3");
    await screen.findByText(product.title);
    expect(context.requests("GET", "/products")[0]?.url.searchParams.get("page")).toBe("3");
    await userEvent.selectOptions(screen.getByLabelText("Sắp xếp theo"), "price_asc");
    await waitFor(() => expect(context.requests("GET", "/products").at(-1)?.url.searchParams.get("sort")).toBe("price_asc"));
    let query = context.requests("GET", "/products").at(-1)!.url.searchParams;
    expect(query.get("q")).toBe("den");
    expect(query.get("min_price")).toBe("100");
    expect(query.get("page")).toBe("1");
    await userEvent.click(screen.getByRole("button", { name: /^Xóa bộ lọc Giá/ }));
    await waitFor(() => expect(context.requests("GET", "/products").at(-1)?.url.searchParams.has("min_price")).toBe(false));
    query = context.requests("GET", "/products").at(-1)!.url.searchParams;
    expect(query.has("max_price")).toBe(false);
    expect(query.get("q")).toBe("den");
    expect(query.get("sort")).toBe("price_asc");
  });

  it("retries a failed catalogue request and shows the existing empty state", async () => {
    context.on("GET", "/products", () => context.requests("GET", "/products").length === 1 ? failure(503, "UNAVAILABLE") : page([]));
    harness.show(<SearchPage />, "/products");
    await screen.findByText("Không tải được kết quả");
    await userEvent.click(screen.getByRole("button", { name: "Tải lại" }));
    expect(await screen.findByText("Không tìm thấy món đồ phù hợp")).toBeInTheDocument();
    expect(context.requests("GET", "/products")).toHaveLength(2);
  });
});
