import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link } from "react-router-dom";
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
  it("uses the request filters as the cache key and reuses equivalent catalogue results", async () => {
    context.on("GET", "/products", ({ url }) => page([
      { ...product, title: `Kết quả ${url.searchParams.get("q")}` },
    ]));
    harness.show(<>
      <Link to="/products?q=ban">Đổi từ khóa</Link>
      <Link to="/products?q=ban&page=01&sort=newest&ref=home">Mở cùng kết quả</Link>
      <SearchPage />
    </>, "/products?q=den&q=ban");
    await screen.findByText("Kết quả den");
    await userEvent.click(screen.getByRole("link", { name: "Đổi từ khóa" }));
    await screen.findByText("Kết quả ban");
    await userEvent.click(screen.getByRole("link", { name: "Mở cùng kết quả" }));
    expect(screen.getByText("Kết quả ban")).toBeInTheDocument();
    expect(context.requests("GET", "/products").map(({ url }) => url.searchParams.get("q"))).toEqual(["den", "ban"]);
  });

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

  it("clears catalogue filters and pagination while preserving the search and sort", async () => {
    harness.show(
      <SearchPage />,
      "/products?q=den&sort=price_asc&page=3&category_id=category&condition=GOOD&province_code=79&delivery_method=COD&min_price=100&max_price=200",
    );
    await screen.findByText(product.title);
    await userEvent.click(screen.getByRole("button", { name: "Xóa bộ lọc" }));

    await waitFor(() => {
      const query = context.requests("GET", "/products").at(-1)!.url.searchParams;
      expect(query.get("page")).toBe("1");
      expect(query.get("q")).toBe("den");
      expect(query.get("sort")).toBe("price_asc");
      for (const key of ["category_id", "condition", "province_code", "delivery_method", "min_price", "max_price"]) {
        expect(query.has(key)).toBe(false);
      }
    });
  });

  it("applies edited desktop prices and clears the fields when the price filter is removed", async () => {
    harness.show(<SearchPage />, "/products?q=den");
    await screen.findByText(product.title);
    const filters = within(screen.getByRole("complementary", { name: "Bộ lọc" }));
    await userEvent.type(filters.getByLabelText("Giá tối thiểu"), "500");
    expect(context.requests("GET", "/products")).toHaveLength(1);
    await userEvent.click(filters.getByRole("button", { name: "Áp dụng giá" }));
    await waitFor(() => expect(context.requests("GET", "/products").at(-1)?.url.searchParams.get("min_price")).toBe("500"));
    await userEvent.click(screen.getByRole("button", { name: /^Xóa bộ lọc Giá/ }));
    expect(filters.getByLabelText("Giá tối thiểu")).toHaveValue("");
  });

  it("validates mobile prices and applies the draft with a single submit", async () => {
    harness.show(<SearchPage />, "/products?q=den&page=3");
    await screen.findByText(product.title);
    await userEvent.click(screen.getByRole("button", { name: "Bộ lọc" }));
    const filters = within(screen.getByRole("dialog", { name: "Bộ lọc" }));
    await userEvent.type(filters.getByLabelText("Giá tối thiểu"), "500");
    const maximum = filters.getByLabelText("Giá tối đa");
    await userEvent.type(maximum, "100");
    await userEvent.click(filters.getByRole("button", { name: "Áp dụng" }));
    expect(filters.getByRole("alert")).toHaveTextContent("Giá tối thiểu không được lớn hơn giá tối đa.");
    expect(context.requests("GET", "/products")).toHaveLength(1);
    await userEvent.clear(maximum);
    await userEvent.type(maximum, "900");
    await userEvent.click(filters.getByRole("button", { name: "Áp dụng" }));
    await waitFor(() => expect(context.requests("GET", "/products").at(-1)?.url.searchParams.get("max_price")).toBe("900"));
    const query = context.requests("GET", "/products").at(-1)?.url.searchParams;
    expect(query?.get("min_price")).toBe("500");
    expect(query?.get("q")).toBe("den");
    expect(query?.get("page")).toBe("1");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
