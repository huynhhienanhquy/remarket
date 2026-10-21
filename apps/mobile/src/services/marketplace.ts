import type { DeliveryMethod, ProductQuery } from "@remarket/shared";

export function deliveryLabel(method: DeliveryMethod): string {
  return method === "BOTH"
    ? "Giao hàng hoặc gặp trực tiếp"
    : method === "COD"
      ? "Giao hàng, trả tiền khi nhận"
      : "Gặp trực tiếp";
}

export function validateSearchFilters(
  filters: Pick<ProductQuery, "min_price" | "max_price">,
): string | null {
  for (const price of [filters.min_price, filters.max_price]) {
    if (price && (!/^\d+$/.test(price) || BigInt(price) > 1_000_000_000n))
      return "Giá phải từ 0 đến 1.000.000.000 VND.";
  }
  return filters.min_price &&
    filters.max_price &&
    BigInt(filters.min_price) > BigInt(filters.max_price)
    ? "Giá tối thiểu không được lớn hơn giá tối đa."
    : null;
}

export function reorderImages<T extends { sort_order: number }>(
  images: T[],
  from: number,
  to: number,
): T[] {
  if (from < 0 || to < 0 || from >= images.length || to >= images.length)
    return images;
  const result = [...images];
  const image = result.splice(from, 1)[0]!;
  result.splice(to, 0, image);
  return result.map((item, sort_order) => ({ ...item, sort_order }));
}
