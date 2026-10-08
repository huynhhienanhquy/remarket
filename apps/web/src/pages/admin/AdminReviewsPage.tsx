import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminReviewItem } from "@remarket/shared";
import { formatDateTime } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { Button, ConfirmDialog, DataTable, Drawer, EmptyState, Input, Pagination, SearchInput, SectionCard, Select, StatusBadge, useToast } from "../../components/ui";
import type { DataTableColumn } from "../../components/ui";
import { AdminHeading, AdminToolbar, QueryErrorAlert, RowAction, ToolbarField, errorDescription, readPage, useAdminParams } from "./adminShared";

function Stars({ value }: { value: number }) {
  return <span aria-label={`${value} trên 5 sao`} className="whitespace-nowrap text-accent">{"★".repeat(value)}<span className="text-line">{"★".repeat(5 - value)}</span></span>;
}

export function AdminReviewsPage() {
  const { params, apply } = useAdminParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const page = readPage(params);
  const selectedId = params.get("selected");
  const ratingRaw = Number(params.get("rating"));
  const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : undefined;
  const visibility = params.get("visibility") === "VISIBLE" || params.get("visibility") === "HIDDEN" ? params.get("visibility")! as "VISIBLE" | "HIDDEN" : undefined;
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [confirmHide, setConfirmHide] = useState(false);
  const [reason, setReason] = useState("");
  useEffect(() => setSearch(params.get("q") ?? ""), [params]);
  const queryInput = useMemo(() => ({ ...(rating ? { rating } : {}), ...(visibility ? { visibility } : {}), ...(params.get("q") ? { q: params.get("q")! } : {}), ...(params.get("handled_by") ? { handled_by: params.get("handled_by")! } : {}), ...(params.get("from") ? { from: params.get("from")! } : {}), ...(params.get("to") ? { to: params.get("to")! } : {}), page }), [rating, visibility, params, page]);
  const query = useQuery({ queryKey: queryKeys.adminReviews(queryInput), queryFn: () => api.admin.reviews(queryInput) });
  const selected = query.data?.items.find((review) => review.id === selectedId) ?? null;

  const mutation = useMutation({
    mutationFn: () => { if (!selected) throw new Error("Chưa chọn đánh giá."); return api.admin.hideReview(selected.id, reason); },
    onSuccess: (review) => {
      queryClient.setQueriesData<{ items: AdminReviewItem[]; meta: unknown }>({ queryKey: ["admin", "reviews"] }, (current) => current ? { ...current, items: current.items.map((item) => item.id === review.id ? review : item) } : current);
      toast.success("Đã ẩn đánh giá"); setConfirmHide(false); setReason("");
      void queryClient.invalidateQueries({ queryKey: ["admin","reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","audit"] });
    },
    onError: (error) => toast.error("Không thể ẩn đánh giá", { description: errorDescription(error) }),
  });

  const columns: Array<DataTableColumn<AdminReviewItem>> = [
    { key: "rating", header: "Đánh giá", render: (review) => <Stars value={review.rating} /> },
    { key: "comment", header: "Nội dung", render: (review) => <p className="line-clamp-2 min-w-[220px] t-body text-ink">{review.comment ?? "Không có nhận xét"}</p> },
    { key: "reviewer", header: "Người đánh giá", render: (review) => review.reviewer.name, hideOnMobile: true },
    { key: "reviewed_user_name", header: "Người bán", hideOnMobile: true },
    { key: "order_code", header: "Đơn hàng", hideOnMobile: true },
    { key: "created_at", header: "Ngày", render: (review) => formatDateTime(review.created_at), hideOnMobile: true },
    { key: "hidden_at", header: "Hiển thị", render: (review) => <StatusBadge label={review.hidden_at ? "Đã ẩn" : "Đang hiển thị"} tone={review.hidden_at ? "neutral" : "brand"} size="sm" /> },
    { key: "id", header: "Thao tác", render: (review) => <RowAction onClick={() => apply({ selected: review.id })}>Xem</RowAction> },
  ];

  return <div>
    <AdminHeading title="Đánh giá" description="Kiểm tra nội dung đánh giá; quản trị viên chỉ có thể ẩn, không sửa nội dung hoặc số sao." />
    <SectionCard bodyClassName="p-0 lg:p-0">
      <div className="p-4 lg:p-6"><AdminToolbar>
        <SearchInput value={search} onValueChange={setSearch} onSubmit={() => apply({ q: search.trim() || null })} placeholder="Tìm trong nội dung đánh giá" label="Tìm đánh giá" className="sm:max-w-sm" />
        <ToolbarField label="Số sao" htmlFor="review-rating"><Select id="review-rating" value={rating ?? ""} onChange={(event) => apply({ rating: event.target.value || null })}><option value="">Tất cả</option>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} sao</option>)}</Select></ToolbarField>
        <ToolbarField label="Hiển thị" htmlFor="review-visibility"><Select id="review-visibility" value={visibility ?? ""} onChange={(event) => apply({ visibility: event.target.value || null })}><option value="">Tất cả</option><option value="VISIBLE">Đang hiển thị</option><option value="HIDDEN">Đã ẩn</option></Select></ToolbarField>
        <ToolbarField label="Từ ngày" htmlFor="review-from"><Input id="review-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
        <ToolbarField label="Người xử lý" htmlFor="review-handler"><Input id="review-handler" value={params.get("handled_by") ?? ""} onChange={(event) => apply({ handled_by: event.target.value || null })} placeholder="UUID quản trị viên" /></ToolbarField>
        <ToolbarField label="Đến ngày" htmlFor="review-to"><Input id="review-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField>
      </AdminToolbar>{query.isError && <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} />}</div>
      {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} loading={query.isPending} onRowClick={(row) => apply({ selected: row.id })} empty={<EmptyState title="Không có đánh giá phù hợp" description="Hãy thay đổi từ khóa hoặc số sao." />} />}
      {query.data && <Pagination className="p-4 lg:px-6" page={query.data.meta.page} totalPages={query.data.meta.total_pages} total={query.data.meta.total} onPageChange={(next) => apply({ page: String(next) })} />}
    </SectionCard>
    <Drawer open={selected !== null} onClose={() => apply({ selected: null }, { replace: true })} title="Chi tiết đánh giá" footer={selected && !selected.hidden_at ? <Button variant="danger" onClick={() => setConfirmHide(true)}>Ẩn đánh giá</Button> : undefined}>
      {selected && <div className="space-y-5"><div className="flex items-center justify-between gap-3"><Stars value={selected.rating} /><StatusBadge label={selected.hidden_at ? "Đã ẩn" : "Đang hiển thị"} tone={selected.hidden_at ? "neutral" : "brand"} /></div><div className="rounded-card bg-surface-subtle p-4 whitespace-pre-wrap t-body text-ink">{selected.comment ?? "Không có nhận xét."}</div><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="t-meta text-muted">Người đánh giá</dt><dd className="mt-1 t-body">{selected.reviewer.name}</dd></div><div><dt className="t-meta text-muted">Người bán</dt><dd className="mt-1 t-body">{selected.reviewed_user_name}</dd></div><div><dt className="t-meta text-muted">Đơn hàng</dt><dd className="mt-1 t-body">{selected.order_code}</dd></div><div><dt className="t-meta text-muted">Ngày đánh giá</dt><dd className="mt-1 t-body">{formatDateTime(selected.created_at)}</dd></div></dl>{selected.hidden_at && <div className="rounded-card bg-danger-bg p-4"><p className="t-label text-danger">Lý do ẩn</p><p className="mt-1 t-body">{selected.hidden_reason}</p><p className="mt-2 t-meta text-muted">Ẩn lúc {formatDateTime(selected.hidden_at)}</p></div>}</div>}
    </Drawer>
    {selected && confirmHide && <ConfirmDialog title="Ẩn đánh giá này?" description="Đánh giá sẽ không còn được tính vào điểm trung bình của người bán. MVP không có thao tác khôi phục." confirmLabel="Ẩn đánh giá" loading={mutation.isPending} onConfirm={() => mutation.mutate()} onCancel={() => { setConfirmHide(false); setReason(""); }} reasonField={{ label: "Lý do ẩn", required: true, value: reason, onChange: setReason, placeholder: "Nêu nội dung vi phạm" }} />}
  </div>;
}
