import type { PageMeta } from "@remarket/shared";
import { Pagination } from "../../common/Pagination/Pagination";

const number = new Intl.NumberFormat("vi-VN");

export function AdminPagination({ meta, shown, resource, qualifier, showArrows, onPageChange }: {
  meta: PageMeta;
  shown: number;
  resource?: "người dùng" | "đánh giá" | "sự kiện";
  qualifier?: string;
  showArrows?: boolean;
  onPageChange: (page: number) => void;
}) {
  const first = (meta.page - 1) * meta.page_size + 1;
  const total = <strong>{number.format(meta.total)}</strong>;
  const range = <strong>{number.format(first)} - {number.format(first + shown - 1)}</strong>;
  const summary = !resource
    ? <>Tổng {total} kết quả{qualifier && <span className="text-muted"> ({qualifier})</span>}</>
    : resource === "người dùng" || !shown
      ? <>Hiển thị <strong>{number.format(shown)}</strong> trên {total} {resource}</>
      : <>Hiển thị {range} trên tổng {total} {resource}</>;

  return <Pagination
    page={meta.page}
    totalPages={meta.total_pages}
    summary={summary}
    showArrows={showArrows}
    leadingPages={resource === "đánh giá" || resource === "sự kiện" ? 3 : 2}
    onPageChange={onPageChange}
  />;
}
