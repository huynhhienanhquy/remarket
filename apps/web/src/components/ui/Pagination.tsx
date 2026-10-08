import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const VI_NUMBER = new Intl.NumberFormat("vi-VN");

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  totalPages: number;
  /** Total result count; renders "Tổng n kết quả" when provided. */
  total?: number;
  onPageChange: (page: number) => void;
  className?: string;
}

type PageItem = number | "gap";

/** Keeps at most 7 slots: edges plus a window around the current page. */
function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    const all: PageItem[] = [];
    for (let i = 1; i <= totalPages; i += 1) all.push(i);
    return all;
  }
  const items: PageItem[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) items.push("gap");
  for (let i = start; i <= end; i += 1) items.push(i);
  if (end < totalPages - 1) items.push("gap");
  items.push(totalPages);
  return items;
}

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  className,
}: PaginationProps) {
  if (total === undefined && totalPages <= 1) return null;

  const items = pageItems(page, Math.max(totalPages, 1));
  const edgeButton =
    "inline-flex min-h-[44px] items-center gap-1 rounded-control border border-line px-3 t-label text-ink transition-colors enabled:hover:bg-surface-subtle disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <nav
      aria-label="Phân trang"
      className={`flex flex-col items-center gap-3 sm:flex-row sm:justify-between ${className ?? ""}`}
    >
      <p className="t-meta text-muted">
        {total !== undefined ? `Tổng ${VI_NUMBER.format(total)} kết quả` : ""}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className={edgeButton}
        >
          <ChevronLeftIcon />
          Trước
        </button>
        {items.map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} aria-hidden="true" className="px-1 t-meta text-muted">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-current={item === page ? "page" : undefined}
              aria-label={`Trang ${item}`}
              onClick={() => onPageChange(item)}
              className={[
                "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-control px-2 t-label transition-colors",
                item === page
                  ? "bg-brand text-white"
                  : "text-ink enabled:hover:bg-surface-subtle",
              ].join(" ")}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className={edgeButton}
        >
          Sau
          <ChevronRightIcon />
        </button>
      </div>
    </nav>
  );
}
