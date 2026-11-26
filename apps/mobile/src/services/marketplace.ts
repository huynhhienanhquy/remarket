import type { DeliveryMethod, ProductQuery } from "@remarket/shared";
import { CONDITIONS, DELIVERY_METHODS, SORT_OPTIONS, provinceLabel } from "@remarket/shared";
import { z } from "zod";

export function productDetailKey(id: string | undefined, viewerId: string | undefined) {
  return ["products", id, viewerId] as const;
}

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

const searchParams = z.object({
  q: z.string().trim().transform((value) => value.slice(0, 100)).optional().catch(undefined),
  category_id: z.string().uuid().optional().catch(undefined),
  province_code: z.string().refine((value) => provinceLabel(value) !== null).optional().catch(undefined),
  condition: z.enum(CONDITIONS).optional().catch(undefined),
  delivery_method: z.enum(DELIVERY_METHODS).optional().catch(undefined),
  sort: z.enum(SORT_OPTIONS).optional().catch(undefined),
  min_price: z.string().regex(/^\d{1,12}$/).optional().catch(undefined),
  max_price: z.string().regex(/^\d{1,12}$/).optional().catch(undefined),
});

export function productSearchFromParams(params: Record<string, string | string[] | undefined>) {
  const { q, category_id, sort, ...filters } = searchParams.parse(params);
  if (validateSearchFilters(filters)) {
    delete filters.min_price;
    delete filters.max_price;
  }
  return { q: q ?? "", category: category_id, sort: sort ?? "newest", filters };
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
