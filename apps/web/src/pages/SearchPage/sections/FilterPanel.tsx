import { useId, useState } from "react";
import type { CategoryNode, Province } from "@remarket/shared";
import { CONDITIONS, CONDITION_LABELS, DELIVERY_METHODS, DELIVERY_LABELS } from "@remarket/shared";
import { Button } from "../../../components/common/Button/Button";
import { Input, Select } from "../../../components/common/Input/Input";
import { Radio } from "../../../components/common/Choice/Choice";
import { type FilterValues, validatePriceRange } from "../filters";

const FILTER_OPTION = "min-h-touch items-center rounded-lg px-2 hover:bg-surface-subtle lg:min-h-8";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-semibold text-ink">{title}</legend>
      <div className="mt-2 space-y-1">{children}</div>
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
  /** Desktop submits prices separately. The mobile drawer owns its draft. */
  onSubmitPrice?: (prices: Pick<FilterValues, "min_price" | "max_price">) => void;
  onReset?: () => void;
  priceError?: string | null;
}

export function FilterPanel({
  values,
  onChange,
  categories,
  provinces,
  onSubmitPrice,
  onReset,
  priceError,
}: FilterPanelProps) {
  const id = useId();
  const [prices, setPrices] = useState({ min_price: values.min_price, max_price: values.max_price });
  const [localError, setLocalError] = useState<string | null>(null);
  const displayed = onSubmitPrice ? prices : values;
  const error = onSubmitPrice ? localError : priceError;

  function patch(next: Partial<FilterValues>) {
    onChange({ ...values, ...next });
  }

  function submitPrice() {
    const nextError = validatePriceRange(prices);
    setLocalError(nextError);
    if (!nextError) onSubmitPrice?.(prices);
  }

  function updatePrice(key: "min_price" | "max_price", input: string) {
    const value = input.replace(/\D/g, "");
    if (onSubmitPrice) {
      setPrices({ ...prices, [key]: value });
      setLocalError(null);
    } else {
      patch({ [key]: value });
    }
  }

  const options = flatten(categories.filter((node) => node.status === "ACTIVE"));

  return (
    <div className="space-y-5">
      <Section title="Danh mục">
        <label htmlFor={`${id}-category`} className="sr-only">
          Danh mục
        </label>
        <Select
          id={`${id}-category`}
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

      <Section title="Khoảng giá (₫)">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-min-price`} className="sr-only">
              Giá tối thiểu
            </label>
            <Input
              id={`${id}-min-price`}
              inputMode="numeric"
              placeholder="Từ"
              value={displayed.min_price}
              error={Boolean(error)}
              aria-describedby={error ? `${id}-price-error` : undefined}
              onChange={(event) => updatePrice("min_price", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && onSubmitPrice) submitPrice();
              }}
            />
          </div>
          <span aria-hidden="true" className="pb-3 t-body text-muted">
            –
          </span>
          <div className="min-w-0 flex-1">
            <label htmlFor={`${id}-max-price`} className="sr-only">
              Giá tối đa
            </label>
            <Input
              id={`${id}-max-price`}
              inputMode="numeric"
              placeholder="Đến"
              value={displayed.max_price}
              error={Boolean(error)}
              aria-describedby={error ? `${id}-price-error` : undefined}
              onChange={(event) => updatePrice("max_price", event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && onSubmitPrice) submitPrice();
              }}
            />
          </div>
        </div>
        {error && (
          <p id={`${id}-price-error`} className="t-meta text-danger" role="alert">
            {error}
          </p>
        )}
        {onSubmitPrice && <Button variant="secondary" onClick={submitPrice} fullWidth>Áp dụng giá</Button>}
      </Section>

      <Section title="Tình trạng">
        <Radio
          name={`${id}-condition`}
          className={FILTER_OPTION}
          checked={values.condition === ""}
          onChange={() => patch({ condition: "" })}
          label="Tất cả"
        />
        {CONDITIONS.map((condition) => (
          <Radio
            key={condition}
            name={`${id}-condition`}
            className={FILTER_OPTION}
            checked={values.condition === condition}
            onChange={() => patch({ condition })}
            label={CONDITION_LABELS[condition]}
          />
        ))}
      </Section>

      <Section title="Khu vực">
        <label htmlFor={`${id}-province`} className="sr-only">
          Khu vực
        </label>
        <Select
          id={`${id}-province`}
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
          name={`${id}-delivery`}
          className={FILTER_OPTION}
          checked={values.delivery_method === ""}
          onChange={() => patch({ delivery_method: "" })}
          label="Tất cả"
        />
        {DELIVERY_METHODS.map((method) => (
          <Radio
            key={method}
            name={`${id}-delivery`}
            className={FILTER_OPTION}
            checked={values.delivery_method === method}
            onChange={() => patch({ delivery_method: method })}
            label={DELIVERY_LABELS[method]}
          />
        ))}
      </Section>

      {onReset && <Button variant="ghost" onClick={() => {
        setPrices({ min_price: "", max_price: "" });
        setLocalError(null);
        onReset();
      }} fullWidth>Đặt lại bộ lọc</Button>}
    </div>
  );
}
