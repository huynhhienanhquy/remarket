import { CONDITION_LABELS, DELIVERY_LABELS, type Condition, type DeliveryMethod } from "@remarket/shared";
import { type FilterValues } from "@/pages/SearchPage/sections/FilterPanel";

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
