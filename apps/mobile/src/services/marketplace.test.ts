import { describe, expect, it } from "vitest";
import { reorderImages, validateSearchFilters } from "./marketplace";

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
