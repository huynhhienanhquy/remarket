import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
const client = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: client }));
import { searchPublicProducts } from "../../src/shared/product-search.js";
import type { ProductSearch } from "../../src/shared/product-search.js";
import { ANONYMOUS_VIEWER } from "../../src/shared/dto-mappers.js";

const input: ProductSearch = { keyword: "", minPrice: null, maxPrice: null, sort: "newest", offset: 0, limit: 20 };
const row = {
  id: "product", sellerId: "seller", title: "Test product", price: new Prisma.Decimal("9007199254740993"),
  condition: "GOOD", provinceCode: "VN-01", publishedAt: new Date(), createdAt: new Date(),
  status: "ACTIVE", isBlocked: false, deletedAt: null, imageUrl: null, imagePath: null,
  sellerName: "Seller", sellerAvatar: null, sellerProvince: "VN-01", sellerJoinedAt: new Date(),
  rating: 4.666666, reviewCount: 3n, completedSalesCount: 2n, favorited: false, total: 7n,
};
beforeEach(() => { vi.resetAllMocks(); client.$queryRaw.mockResolvedValue([row]); });
describe("single-snapshot public search", () => {
  it("maps exact money/reputation/page metadata with only one SQL query", async () => {
    const result = await searchPublicProducts(input, ANONYMOUS_VIEWER);
    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(7);
    expect(result.items[0]).toMatchObject({ price: "9007199254740993", image_url: null, is_favorited: false,
      seller: { rating: 4.7, review_count: 3, completed_sales_count: 2 } });
    expect(result.items[0]).not.toHaveProperty("seller.email");
  });
  it("keeps total count for an empty or out-of-range page", async () => {
    client.$queryRaw.mockResolvedValue([{ id: null, total: 7n }]);
    expect(await searchPublicProducts(input, ANONYMOUS_VIEWER)).toEqual({ total: 7, items: [] });
  });
  it("parameterizes filters and keeps visibility checks in the same snapshot", async () => {
    const keyword = "%' OR true --";
    await searchPublicProducts({ ...input, keyword, categoryId: "parent", minPrice: "100", condition: "GOOD", deliveryMethod: "COD" }, ANONYMOUS_VIEWER);
    const sql: Prisma.Sql = client.$queryRaw.mock.calls[0]![0];
    expect(sql.values).toContain(keyword);
    expect(sql.text).not.toContain(keyword);
    expect(sql.text).toContain('p."deletedAt" IS NULL');
    expect(sql.text).toContain('NOT p."isBlocked"');
    expect(sql.text).toContain("active_categories");
    expect(sql.text).toContain("selected_categories");
  });
  it("reads the viewer's favorite and exposes only owner flags", async () => {
    client.$queryRaw.mockResolvedValue([{ ...row, favorited: true }]);
    expect((await searchPublicProducts(input, { ...ANONYMOUS_VIEWER, viewerId: "seller" })).items[0])
      .toMatchObject({ is_favorited: true, is_blocked: false, is_hidden: false });
    expect((await searchPublicProducts(input, { ...ANONYMOUS_VIEWER, viewerId: "buyer" })).items[0])
      .not.toHaveProperty("is_blocked");
  });
});
