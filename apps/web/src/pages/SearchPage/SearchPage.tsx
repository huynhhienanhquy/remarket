import { useProductSearch } from "./hooks/useProductSearch";
import { FilterChip } from "./sections/FilterChip";
import { Link } from "react-router-dom";
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
} from "../../components/common";
import { FilterPanel, type FilterValues, emptyFilters } from "./sections/FilterPanel";

const SORT_OPTIONS = [
  { value: "newest", label: "Mới nhất" },
  { value: "price_asc", label: "Giá thấp → cao" },
  { value: "price_desc", label: "Giá cao → thấp" },
] as const;

export function SearchPage() {
  const {
    q,
    sort,
    filters,
    keyword,
    setKeyword,
    sheetOpen,
    setSheetOpen,
    draft,
    setDraft,
    categories,
    provinces,
    applyParams,
    listQuery,
    toggleFavorite,
    submitKeyword,
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
