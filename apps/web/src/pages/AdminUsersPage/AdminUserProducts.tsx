import { PRODUCT_STATUS_LABELS, formatDate, formatVnd } from "@remarket/shared";
import type { ProductStatus } from "@remarket/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { QueryErrorAlert } from "../../components/admin/QueryErrorAlert/QueryErrorAlert";
import { ApiImage, EmptyState, Pagination, StatusBadge, Tabs } from "../../components/common";
import { queryKeys } from "../../config/queryClient";
import { apiForQuery } from "../../services/api";

const FILTERS = [
  { value: "ALL", label: "Tất cả" },
  { value: "ACTIVE", label: "Đang bán" },
  { value: "SOLD", label: "Đã bán" },
  { value: "PENDING", label: "Chờ duyệt" },
];

export function AdminUserProducts({ userId }: { userId: string }) {
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(1);
  const input = { seller_id: userId, ...(status === "ALL" ? {} : { status: status as ProductStatus }), page };
  const query = useQuery({ queryKey: queryKeys.adminProducts(input), queryFn: ({ signal }) => apiForQuery(signal).admin.products(input) });

  return (
    <section aria-label="Sản phẩm của người dùng" className="space-y-4 border-t border-line pt-6">
      <h3 className="t-h3 text-ink">Sản phẩm của người dùng</h3>
      <Tabs tabs={FILTERS} value={status} onChange={(value) => { setStatus(value); setPage(1); }} ariaLabel="Trạng thái sản phẩm của người dùng" />
      {query.isPending ? <p role="status" className="t-body text-muted">Đang tải sản phẩm…</p>
        : query.isError ? <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} />
        : <>
          {query.data.items.length === 0 ? <EmptyState title={status === "ALL" ? "Người dùng chưa có sản phẩm" : "Không có sản phẩm ở trạng thái này"} />
            : <ul className="space-y-3">
              {query.data.items.map((product) => {
                const badge = PRODUCT_STATUS_LABELS[product.status];
                const target = new URLSearchParams({ seller_id: userId, status, page: String(query.data.meta.page), selected: product.id });
                return <li key={product.id}>
                  <Link to={`/admin/products?${target.toString()}`} className="flex gap-3 rounded-card border border-line p-3 transition-colors hover:bg-surface-subtle">
                    {product.image_url ? <ApiImage src={product.image_url} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover" /> : <div aria-hidden="true" className="h-20 w-20 shrink-0 rounded-xl bg-surface-subtle" />}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="line-clamp-2 t-label text-ink">{product.title}</p>
                      <p className="t-label text-brand">{formatVnd(product.price)}</p>
                      <div className="flex flex-wrap gap-1"><StatusBadge label={badge.label} tone={badge.tone} size="sm" />{product.is_blocked && <StatusBadge label="Bị hạn chế" tone="danger" size="sm" />}</div>
                      <p className="t-meta text-muted">{product.category_name} · {formatDate(product.created_at)}</p>
                      <p className="t-meta text-brand">Xem chi tiết</p>
                    </div>
                  </Link>
                </li>;
              })}
            </ul>}
          <Pagination page={query.data.meta.page} totalPages={query.data.meta.total_pages} total={query.data.meta.total} onPageChange={setPage} />
        </>}
    </section>
  );
}
