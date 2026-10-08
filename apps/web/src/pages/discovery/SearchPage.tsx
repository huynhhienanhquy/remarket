import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CONDITION_LABELS,
  DELIVERY_LABELS,
  type Condition,
  type DeliveryMethod,
  type ProductListItem,
} from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { useSession } from "../../app/SessionProvider";
import { loginPathFor } from "../../app/guards";
import {
  Button,
  Drawer,
  EmptyState,
  FilterIcon,
  InlineAlert,
  Pagination,
  ProductCard,
  ProductCardSkeleton,
  Select,
} from "../../components/ui";
import { FilterPanel, type FilterValues, emptyFilters } from "./FilterPanel";

const SORT_OPTIONS = [
  { value: "newest", label: "Mới nhất" },
  { value: "price_asc", label: "Giá thấp → cao" },
  { value: "price_desc", label: "Giá cao → thấp" },
] as const;

const PAGE_SIZE = 12;

function readFilters(params: URLSearchParams): FilterValues {
  return {
    category_id: params.get("category_id") ?? "",
    min_price: params.get("min_price") ?? "",
    max_price: params.get("max_price") ?? "",
    condition: (params.get("condition") ?? "") as Condition | "",
    province_code: params.get("province_code") ?? "",
    delivery_method: (params.get("delivery_method") ?? "") as DeliveryMethod | "",
  };
}

function countFilters(values: FilterValues): number {
  return Object.values(values).filter((value) => value !== "").length;
}

/** Chip describing one active filter, with a direct remove control. */
function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 t-meta text-brand">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Xóa bộ lọc ${label}`}
        className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-brand hover:text-white"
      >
        ×
      </button>
    </span>
  );
}

interface ChipSpec {
  key: keyof FilterValues;
  label: string;
}

function buildChips(values: FilterValues, categoryNames: Map<string, string>, provinceNames: Map<string, string>): ChipSpec[] {
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

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { viewer } = useSession();

  const q = searchParams.get("q") ?? "";
  const sort = (searchParams.get("sort") ?? "newest") as "newest" | "price_asc" | "price_desc";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const filters = useMemo(() => readFilters(searchParams), [searchParams]);

  const [keyword, setKeyword] = useState(q);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [draft, setDraft] = useState<FilterValues>(filters);

  useEffect(() => setKeyword(q), [q]);
  // Discard unapplied sheet edits whenever it is reopened (ui-spec 8).
  useEffect(() => {
    if (sheetOpen) setDraft(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetOpen]);

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.categories.tree(),
    staleTime: 5 * 60_000,
  });
  const provinces = useQuery({
    queryKey: queryKeys.provinces,
    queryFn: () => api.categories.provinces(),
    staleTime: 5 * 60_000,
  });

  const categoryNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const root of categories.data ?? []) {
      map.set(root.id, root.name);
      for (const child of root.children ?? []) map.set(child.id, child.name);
    }
    return map;
  }, [categories.data]);
  const provinceNames = useMemo(
    () => new Map((provinces.data ?? []).map((entry) => [entry.code, entry.name])),
    [provinces.data],
  );

  /** Writes filters/sort/search to the URL; every filter change resets page. */
  const applyParams = useCallback(
    (patch: Record<string, string | null>, options?: { replace?: boolean }) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in patch)) next.delete("page");
      setSearchParams(next, { replace: options?.replace ?? false });
    },
    [searchParams, setSearchParams],
  );

  const listQuery = useQuery({
    queryKey: queryKeys.products({ ...Object.fromEntries(searchParams), page_size: PAGE_SIZE }),
    queryFn: () =>
      api.products.list({
        q: q || undefined,
        category_id: filters.category_id || undefined,
        min_price: filters.min_price || undefined,
        max_price: filters.max_price || undefined,
        condition: filters.condition || undefined,
        province_code: filters.province_code || undefined,
        delivery_method: filters.delivery_method || undefined,
        sort,
        page,
        page_size: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const favorites = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.favorites.set(id, on),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  function toggleFavorite(product: ProductListItem) {
    if (!viewer) {
      navigate(loginPathFor(location.pathname, location.search));
      return;
    }
    favorites.mutate({ id: product.id, on: !product.is_favorited });
  }

  function submitKeyword() {
    applyParams({ q: keyword.trim() || null });
  }

  function clearFilters() {
    const next = new URLSearchParams(searchParams);
    for (const key of ["category_id", "min_price", "max_price", "condition", "province_code", "delivery_method"]) {
      next.delete(key);
    }
    next.delete("page");
    setSearchParams(next);
  }

  function removeChip(key: keyof FilterValues) {
    if (key === "min_price") applyParams({ min_price: null, max_price: null });
    else applyParams({ [key]: null });
  }

  const chips = buildChips(filters, categoryNames, provinceNames);
  const activeCount = countFilters(filters);
  const items = listQuery.data?.items ?? [];
  const meta = listQuery.data?.meta;
  const isRefetching = listQuery.isFetching && !listQuery.isPending;
  const filtered = activeCount > 0 || q !== "";

  const title = q ? `Kết quả cho '${q}'` : "Khám phá sản phẩm";

  const filterPanel = (values: FilterValues, onChange: (next: FilterValues) => void) => (
    <FilterPanel
      values={values}
      onChange={onChange}
      categories={categories.data ?? []}
      provinces={provinces.data ?? []}
      onSubmitPrice={() => applyParams({
        min_price: values.min_price || null,
        max_price: values.max_price || null,
      })}
      onReset={() => onChange(emptyFilters())}
    />
  );

  return (
    <div className="rm-container py-6 lg:py-8">
      {/* Heading */}
      <nav aria-label="Đường dẫn" className="t-meta text-muted">
        <Link to="/" className="hover:text-ink">
          Trang chủ
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Sản phẩm</span>
      </nav>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="t-h1 text-ink">{title}</h1>
          <p className="mt-1 t-body text-muted" aria-live="polite">
            {listQuery.isPending
              ? "Đang tải kết quả…"
              : `${meta?.total ?? 0} kết quả`}
            {isRefetching && <span className="ml-2 t-meta">· Đang cập nhật</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="sr-only">
            Sắp xếp theo
          </label>
          <Select
            id="sort-select"
            value={sort}
            onChange={(event) => applyParams({ sort: event.target.value })}
            className="h-11 min-w-[180px]"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Mobile filter bar */}
      <div className="mt-4 flex gap-2 lg:hidden">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={() => setSheetOpen(true)}
        >
          <FilterIcon className="mr-2" />
          Bộ lọc {activeCount > 0 ? `(${activeCount})` : ""}
        </Button>
      </div>

      {/* Active chips */}
      {(chips.length > 0 || q !== "") && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {q !== "" && (
            <FilterChip
              label={`Từ khóa: ${q}`}
              onRemove={() => {
                setKeyword("");
                applyParams({ q: null });
              }}
            />
          )}
          {chips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              onRemove={() => removeChip(chip.key)}
            />
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="t-label text-danger hover:underline"
          >
            Xóa bộ lọc
          </button>
        </div>
      )}

      <div className="mt-6 flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block" aria-label="Bộ lọc">
          <div className="sticky top-[104px]">{filterPanel(filters, (next) => applyParams({
            category_id: next.category_id || null,
            min_price: next.min_price || null,
            max_price: next.max_price || null,
            condition: next.condition || null,
            province_code: next.province_code || null,
            delivery_method: next.delivery_method || null,
          }))}</div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1" aria-busy={isRefetching || undefined}>
          {listQuery.isPending ? (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : listQuery.isError ? (
            <InlineAlert
              tone="danger"
              title="Không tải được kết quả"
              action={
                <Button variant="secondary" onClick={() => listQuery.refetch()}>
                  Tải lại
                </Button>
              }
            >
              Vui lòng thử lại sau.
            </InlineAlert>
          ) : items.length === 0 ? (
            <EmptyState
              title="Không tìm thấy món đồ phù hợp"
              description={
                filtered
                  ? "Hãy thử thay đổi từ khóa hoặc xóa bớt bộ lọc."
                  : "Chưa có tin đăng nào ở thời điểm này."
              }
              action={
                filtered
                  ? { label: "Xóa bộ lọc", onClick: clearFilters }
                  : { label: "Về trang chủ", to: "/" }
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
                {items.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
              <Pagination
                className="mt-8"
                page={meta?.page ?? 1}
                totalPages={meta?.total_pages ?? 1}
                total={meta?.total}
                onPageChange={(next) => applyParams({ page: String(next) }, { replace: false })}
              />
            </>
          )}
        </div>
      </div>

      {/* Mobile filter sheet: drafts live here, only "Áp dụng" hits the URL */}
      <Drawer
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Bộ lọc"
        widthClassName="max-w-none"
        className="!inset-x-0 !bottom-0 !top-auto !h-auto max-h-[90dvh] rounded-t-modal"
        footer={
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setDraft(emptyFilters())}
            >
              Đặt lại
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              onClick={() => {
                applyParams({
                  category_id: draft.category_id || null,
                  min_price: draft.min_price || null,
                  max_price: draft.max_price || null,
                  condition: draft.condition || null,
                  province_code: draft.province_code || null,
                  delivery_method: draft.delivery_method || null,
                });
                setSheetOpen(false);
              }}
            >
              Áp dụng
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="sheet-keyword" className="t-label text-ink">
              Từ khóa
            </label>
            <input
              id="sheet-keyword"
              type="search"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  submitKeyword();
                  setSheetOpen(false);
                }
              }}
              placeholder="Bạn đang tìm món đồ gì?"
              className="mt-1.5 h-11 w-full rounded-control border border-input-line bg-surface px-3 t-body text-ink placeholder:text-muted focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
            />
          </div>
          {filterPanel(draft, setDraft)}
        </div>
      </Drawer>
    </div>
  );
}
