import { describe, expect, it } from "vitest";
import { productSearchFromParams, reorderImages, validateSearchFilters } from "./marketplace";

describe("marketplace filters", () => {
  it("accepts an open range and exact VND limits", () => {
    expect(validateSearchFilters({})).toBeNull();
    expect(
      validateSearchFilters({ min_price: "0", max_price: "1000000000" }),
    ).toBeNull();
    expect(
      validateSearchFilters({ min_price: "15000", max_price: "15000" }),
    ).toBeNull();
  });
  it("rejects inverted, oversized and malformed prices before requesting", () => {
    for (const input of [
      { min_price: "20000", max_price: "10000" },
      { max_price: "1000000001" },
      { min_price: "-1" },
      { min_price: "1.5" },
      { min_price: "1e9" },
    ])
      expect(validateSearchFilters(input)).toBeTruthy();
  });
  it("opens a catalog link with all filters from an assistant search", () => {
    const category = "c075fffb-8450-4c83-a88f-23e6601197aa";
    expect(productSearchFromParams({
      q: "iPhone 13",
      category_id: category,
      province_code: "VN-52",
      condition: "GOOD",
      delivery_method: "MEETUP",
      min_price: "0",
      max_price: "7999999",
      sort: "price_asc",
    })).toEqual({
      q: "iPhone 13",
      category,
      filters: {
        province_code: "VN-52",
        condition: "GOOD",
        delivery_method: "MEETUP",
        min_price: "0",
        max_price: "7999999",
      },
      sort: "price_asc",
    });
  });
  it("ignores invalid links without discarding valid filters", () => {
    expect(productSearchFromParams({
      q: ["one", "two"],
      province_code: "VN-52",
      sort: "unknown",
      condition: "unknown",
      min_price: "20000",
      max_price: "10000",
    })).toEqual({ q: "", category: undefined, sort: "newest", filters: { province_code: "VN-52" } });
  });
});

describe("listing images", () => {
  const images = [
    { storage_path: "one", sort_order: 0 },
    { storage_path: "two", sort_order: 1 },
    { storage_path: "three", sort_order: 2 },
  ];
  it("changes the cover image without losing storage paths or mutating the draft", () => {
    expect(reorderImages(images, 2, 0)).toEqual([
      { storage_path: "three", sort_order: 0 },
      { storage_path: "one", sort_order: 1 },
      { storage_path: "two", sort_order: 2 },
    ]);
    expect(images[0]?.storage_path).toBe("one");
  });
  it("renumbers adjacent moves and ignores out-of-bounds moves", () => {
    expect(
      reorderImages(images, 0, 1).map((item) => item.storage_path),
    ).toEqual(["two", "one", "three"]);
    expect(reorderImages(images, -1, 0)).toBe(images);
    expect(reorderImages(images, 0, 3)).toBe(images);
  });
});
