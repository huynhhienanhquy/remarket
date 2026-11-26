import { CONDITION_LABELS, DELIVERY_LABELS, validatePrice, type Condition, type DeliveryMethod } from "@remarket/shared";

export interface FilterValues {
  category_id: string;
  min_price: string;
  max_price: string;
  condition: Condition | "";
  province_code: string;
  delivery_method: DeliveryMethod | "";
}

export function emptyFilters(): FilterValues {
  return {
    category_id: "",
    min_price: "",
    max_price: "",
    condition: "",
    province_code: "",
    delivery_method: "",
  };
}

export function readFilters(params: URLSearchParams): FilterValues {
  return {
    category_id: params.get("category_id") ?? "",
    min_price: params.get("min_price") ?? "",
    max_price: params.get("max_price") ?? "",
    condition: (params.get("condition") ?? "") as Condition | "",
    province_code: params.get("province_code") ?? "",
    delivery_method: (params.get("delivery_method") ?? "") as DeliveryMethod | "",
  };
}

export function countFilters(values: FilterValues): number {
  return Object.values(values).filter((value) => value !== "").length;
}

export function validatePriceRange({ min_price, max_price }: Pick<FilterValues, "min_price" | "max_price">) {
  const error = (min_price && validatePrice(min_price)) || (max_price && validatePrice(max_price));
  if (error) return error;
  if (min_price && max_price && BigInt(min_price) > BigInt(max_price)) {
    return "Giá tối thiểu không được lớn hơn giá tối đa.";
  }
  return null;
}

interface ChipSpec {
  key: keyof FilterValues;
  label: string;
}

export function buildChips(values: FilterValues, categoryNames: Map<string, string>, provinceNames: Map<string, string>): ChipSpec[] {
  const chips: ChipSpec[] = [];
  if (values.category_id) {
    chips.push({ key: "category_id", label: categoryNames.get(values.category_id) ?? "Danh mục" });
  }
  if (values.min_price || values.max_price) {
    const from = values.min_price ? Number(values.min_price).toLocaleString("vi-VN") : "0";
    const to = values.max_price ? Number(values.max_price).toLocaleString("vi-VN") : "không giới hạn";
    chips.push({ key: "min_price", label: `Giá ${from} – ${to} ₫` });
  }
  if (values.condition) {
    chips.push({ key: "condition", label: CONDITION_LABELS[values.condition] });
  }
  if (values.province_code) {
    chips.push({ key: "province_code", label: provinceNames.get(values.province_code) ?? "Khu vực" });
  }
  if (values.delivery_method) {
    chips.push({ key: "delivery_method", label: DELIVERY_LABELS[values.delivery_method] });
  }
  return chips;
}
