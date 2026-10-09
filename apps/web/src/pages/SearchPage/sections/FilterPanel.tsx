import { useState } from "react";
import type { CategoryNode, Condition, DeliveryMethod, Province } from "@remarket/shared";
import { CONDITION_LABELS, DELIVERY_LABELS, validatePrice } from "@remarket/shared";
import { Button, Input, Radio, Select } from "../../../components/common";

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

const CONDITIONS: Condition[] = ["LIKE_NEW", "GOOD", "FAIR", "HEAVILY_USED"];
const DELIVERY: DeliveryMethod[] = ["COD", "MEETUP", "BOTH"];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-line pt-4 first:border-t-0 first:pt-0">
      <legend className="t-label text-ink">{title}</legend>
      <div className="mt-2 space-y-2">{children}</div>
    </fieldset>
  );
}

/** Flattens the tree into grouped options with depth-based indentation. */
function flatten(
  nodes: CategoryNode[],
  depth = 0,
): { id: string; label: string; depth: number }[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: node.name, depth },
    ...flatten(node.children ?? [], depth + 1),
  ]);
}

export interface FilterPanelProps {
  values: FilterValues;
  onChange: (next: FilterValues) => void;
  categories: CategoryNode[];
  provinces: Province[];
  /** Price commits only on this callback (Enter or "Áp dụng", ui-spec 8). */
  onSubmitPrice: () => void;
  onReset: () => void;
}

/**
 * Filter controls shared by the desktop sidebar and the mobile bottom sheet.
 * Non-price filters emit on change; the price pair waits for an explicit submit.
 */
export function FilterPanel({
  values,
  onChange,
  categories,
  provinces,
  onSubmitPrice,
  onReset,
}: FilterPanelProps) {
  const [minPrice, setMinPrice] = useState(values.min_price);
  const [maxPrice, setMaxPrice] = useState(values.max_price);
  const [priceError, setPriceError] = useState<string | null>(null);

  function patch(next: Partial<FilterValues>) {
    onChange({ ...values, ...next });
  }

  function submitPrice() {
    const minError = minPrice ? validatePrice(minPrice) : null;
    const maxError = maxPrice ? validatePrice(maxPrice) : null;
    if (minError || maxError) {
      setPriceError(minError ?? maxError);
      return;
    }
    if (minPrice && maxPrice && BigInt(minPrice) > BigInt(maxPrice)) {
      setPriceError("Giá tối thiểu không được lớn hơn giá tối đa.");
      return;
    }
    setPriceError(null);
    patch({ min_price: minPrice, max_price: maxPrice });
    onSubmitPrice();
  }

  const options = flatten(categories.filter((node) => node.status === "ACTIVE"));

  return (
    <div className="space-y-4">
      <Section title="Danh mục">
        <label htmlFor="filter-category" className="sr-only">
          Danh mục
        </label>
        <Select
          id="filter-category"
          value={values.category_id}
          onChange={(event) => patch({ category_id: event.target.value })}
        >
          <option value="">Tất cả danh mục</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.depth > 0 ? `${"— ".repeat(option.depth)}` : ""}
              {option.label}
            </option>
          ))}
        </Select>
      </Section>

      <Section title="Khoảng giá">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="filter-min-price" className="sr-only">
              Giá tối thiểu
            </label>
            <Input
              id="filter-min-price"
              inputMode="numeric"
              placeholder="Từ"
              value={minPrice}
              error={Boolean(priceError)}
              onChange={(event) => setMinPrice(event.target.value.replace(/\D/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitPrice();
              }}
            />
          </div>
          <span aria-hidden="true" className="pb-3 t-body text-muted">
            –
          </span>
          <div className="flex-1">
            <label htmlFor="filter-max-price" className="sr-only">
              Giá tối đa
            </label>
            <Input
              id="filter-max-price"
              inputMode="numeric"
              placeholder="Đến"
              value={maxPrice}
              error={Boolean(priceError)}
              onChange={(event) => setMaxPrice(event.target.value.replace(/\D/g, ""))}
              onKeyDown={(event) => {
                if (event.key === "Enter") submitPrice();
              }}
            />
          </div>
        </div>
        {priceError && (
          <p className="t-meta text-danger" role="alert">
            {priceError}
          </p>
        )}
        <Button variant="secondary" onClick={submitPrice}>
          Áp dụng
        </Button>
      </Section>

      <Section title="Tình trạng">
        <Radio
          name="filter-condition"
          checked={values.condition === ""}
          onChange={() => patch({ condition: "" })}
          label="Tất cả"
        />
        {CONDITIONS.map((condition) => (
          <Radio
            key={condition}
            name="filter-condition"
            checked={values.condition === condition}
            onChange={() => patch({ condition })}
            label={CONDITION_LABELS[condition]}
          />
        ))}
      </Section>

      <Section title="Khu vực">
        <label htmlFor="filter-province" className="sr-only">
          Khu vực
        </label>
        <Select
          id="filter-province"
          value={values.province_code}
          onChange={(event) => patch({ province_code: event.target.value })}
        >
          <option value="">Toàn quốc</option>
          {provinces.map((province) => (
            <option key={province.code} value={province.code}>
              {province.name}
            </option>
          ))}
        </Select>
      </Section>

      <Section title="Giao nhận">
        <Radio
          name="filter-delivery"
          checked={values.delivery_method === ""}
          onChange={() => patch({ delivery_method: "" })}
          label="Tất cả"
        />
        {DELIVERY.map((method) => (
          <Radio
            key={method}
            name="filter-delivery"
            checked={values.delivery_method === method}
            onChange={() => patch({ delivery_method: method })}
            label={DELIVERY_LABELS[method]}
          />
        ))}
      </Section>

      <Button variant="ghost" onClick={onReset} className="w-full">
        Đặt lại bộ lọc
      </Button>
    </div>
  );
}
