import { useId, useState } from "react";
import { useProductSearch } from "./hooks/useProductSearch";
import { FilterChip } from "./sections/FilterChip";
import { Link } from "react-router-dom";
import { Button } from "../../components/common/Button/Button";
import { Drawer } from "../../components/common/Drawer/Drawer";
import { EmptyState } from "../../components/common/EmptyState/EmptyState";
import { FilterIcon } from "../../components/common/Icon/Icon";
import { InlineAlert } from "../../components/common/InlineAlert/InlineAlert";
import { Pagination } from "../../components/common/Pagination/Pagination";
import { ProductCard } from "../../components/common/ProductCard/ProductCard";
import { ProductCardSkeleton } from "../../components/common/Skeleton/Skeleton";
import { Select } from "../../components/common/Input/Input";
import { FilterPanel } from "./sections/FilterPanel";
import { type FilterValues, emptyFilters, validatePriceRange } from "./filters";

const SORT_OPTIONS = [
  { value: "newest", label: "Mới nhất" },
  { value: "price_asc", label: "Giá thấp → cao" },
  { value: "price_desc", label: "Giá cao → thấp" },
] as const;

export function SearchPage() {
  const filterFormId = useId();
  const [priceError, setPriceError] = useState<string | null>(null);
  const {
    q,
    sort,
    filters,
    sheetOpen,
    setSheetOpen,
    draft,
    setDraft,
    categories,
    provinces,
    applyParams,
    listQuery,
    toggleFavorite,
    clearFilters,
    removeChip,
    chips,
    activeCount,
    items,
    meta,
    isRefetching,
    filtered,
    title,
  } = useProductSearch();

  const options = { categories: categories.data ?? [], provinces: provinces.data ?? [] };

  function applyFilters(values: FilterValues) {
    applyParams({ ...values });
  }

  function applyDraft() {
    const error = validatePriceRange(draft);
    setPriceError(error);
    if (error) return;
    applyFilters(draft);
    setSheetOpen(false);
  }

  return (
    <div className="rm-container py-4 lg:py-8">
      {/* Heading */}
      <nav aria-label="Đường dẫn" className="t-meta text-muted">
        <Link to="/" className="hover:text-ink">
          Trang chủ
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">Sản phẩm</span>
      </nav>

      <div className="rm-card-panel mt-3 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 shadow-subtle sm:p-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="t-h1 break-words text-ink">{title}</h1>
          <p className="mt-1 t-body text-muted" aria-live="polite">
            {listQuery.isPending
              ? "Đang tải kết quả…"
              : listQuery.isError ? "Không thể tải kết quả" : `${meta?.total ?? 0} kết quả`}
            {isRefetching && <span className="ml-2 t-meta">· Đang cập nhật</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
          <Button
            variant="secondary"
            className="flex-1 lg:hidden"
            onClick={() => {
              setDraft(filters);
              setPriceError(null);
              setSheetOpen(true);
            }}
          >
            <span className="flex items-center gap-2 whitespace-nowrap">
              <FilterIcon />
              Bộ lọc {activeCount > 0 ? `(${activeCount})` : ""}
            </span>
          </Button>
          <label htmlFor="sort-select" className="sr-only">
            Sắp xếp theo
          </label>
          <Select
            id="sort-select"
            value={sort}
            onChange={(event) => applyParams({ sort: event.target.value })}
            className="h-touch min-w-0 flex-[2] text-sm lg:min-w-[180px]"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Active chips */}
      {(chips.length > 0 || q !== "") && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {q !== "" && (
            <FilterChip
              label={`Từ khóa: ${q}`}
              onRemove={() => applyParams({ q: null })}
            />
          )}
          {chips.map((chip) => (
            <FilterChip
              key={chip.key}
              label={chip.label}
              onRemove={() => removeChip(chip.key)}
            />
          ))}
          {chips.length > 0 && <button
            type="button"
            onClick={clearFilters}
            className="min-h-touch px-1 text-sm font-semibold text-brand hover:underline"
          >
            Xóa bộ lọc
          </button>}
        </div>
      )}

      <div className="mt-6 flex gap-6">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 lg:block" aria-label="Bộ lọc">
          <div className="rm-card-panel sticky top-[140px] max-h-[calc(100dvh-156px)] overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-subtle">
            <h2 className="mb-4 flex items-center gap-2 border-b border-line pb-4 text-base font-semibold text-ink"><FilterIcon size={18} /> Bộ lọc</h2>
            <FilterPanel
              key={`${filters.min_price}:${filters.max_price}`}
              {...options}
              values={filters}
              onChange={applyFilters}
              onSubmitPrice={(prices) => applyParams(prices)}
              onReset={clearFilters}
            />
          </div>
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1" aria-busy={isRefetching || undefined}>
          {listQuery.isPending ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4">
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
                activeCount > 0
                  ? { label: "Xóa bộ lọc", onClick: clearFilters }
                  : q !== ""
                    ? { label: "Xóa từ khóa", onClick: () => applyParams({ q: null }) }
                    : { label: "Về trang chủ", to: "/" }
              }
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4">
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
        className="!inset-x-0 !bottom-0 !top-auto !h-auto max-h-[90dvh] rounded-t-modal sm:mx-auto sm:!max-w-[560px]"
        footer={
          <div className="flex gap-3">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setDraft(emptyFilters());
                setPriceError(null);
              }}
            >
              Đặt lại
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              form={filterFormId}
              type="submit"
            >
              Áp dụng
            </Button>
          </div>
        }
      >
        <form id={filterFormId} onSubmit={(event) => { event.preventDefault(); applyDraft(); }}>
          <FilterPanel
            {...options}
            values={draft}
            onChange={(next) => { setDraft(next); setPriceError(null); }}
            priceError={priceError}
          />
        </form>
      </Drawer>
    </div>
  );
}
