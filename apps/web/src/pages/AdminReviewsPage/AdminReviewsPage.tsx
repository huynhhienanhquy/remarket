import type { AdminReviewItem } from "@remarket/shared";
import { formatDateTime } from "@remarket/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AdminDataTable as DataTable } from "../../components/admin/AdminDataTable/AdminDataTable";
import { AdminPagination } from "../../components/admin/AdminPagination/AdminPagination";
import { AdminHeading } from "../../components/admin/AdminHeading/AdminHeading";
import { AdminMetrics } from "../../components/admin/AdminSummary/AdminSummary";
import { AdminAdvancedFilters, AdminToolbar, ToolbarField } from "../../components/admin/AdminToolbar/AdminToolbar";
import { QueryErrorAlert } from "../../components/admin/QueryErrorAlert/QueryErrorAlert";
import { RowAction } from "../../components/admin/RowAction/RowAction";
import type { DataTableColumn } from "../../components/common/DataTable/DataTable";
import { Button } from "../../components/common/Button/Button";
import { ConfirmDialog } from "../../components/common/Dialog/Dialog";
import { Drawer } from "../../components/common/Drawer/Drawer";
import { EmptyState } from "../../components/common/EmptyState/EmptyState";
import { Icon } from "../../components/common/Icon/Icon";
import { Input, Select } from "../../components/common/Input/Input";
import { SearchInput } from "../../components/common/SearchInput/SearchInput";
import { SectionCard } from "../../components/common/SectionCard/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge/StatusBadge";
import { useToast } from "../../components/common/Toast/Toast";
import { queryKeys } from "../../config/queryClient";
import { invalidateAdminResources, patchAdminRows } from "../../helpers/adminCache";
import { errorDescription } from "../../helpers/adminErrors";
import { useAdminParams } from "../../hooks/useAdminParams";
import { formatAdminPercent, useAdminSummary } from "../../hooks/useAdminSummary";
import { api, apiForQuery } from "../../services/api";
import { readPage } from "../../utils/adminParams";

function Stars({ value }: { value: number }) {
  return <span role="img" aria-label={`${value} trên 5 sao`} className="admin-stars">{Array.from({ length: 5 }, (_, index) => <Icon key={index} name="star" size={14} className={index < value ? "text-accent" : "admin-star-empty"} />)}</span>;
}

export function AdminReviewsPage() {
  const { params, apply } = useAdminParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: summary } = useAdminSummary("reviews");
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
  const query = useQuery({ queryKey: queryKeys.adminReviews(queryInput), queryFn: ({ signal }) => apiForQuery(signal).admin.reviews(queryInput) });
  const selected = query.data?.items.find((review) => review.id === selectedId) ?? null;

  const mutation = useMutation({
    mutationFn: () => { if (!selected) throw new Error("Chưa chọn đánh giá."); return api.admin.hideReview(selected.id, reason); },
    onSuccess: (review) => {
      patchAdminRows(queryClient, "reviews", review);
      toast.success("Đã ẩn đánh giá"); setConfirmHide(false); setReason("");
      void invalidateAdminResources(queryClient, "reviews", "audit");
      },
    onError: (error) => toast.error("Không thể ẩn đánh giá", { description: errorDescription(error) }),
  });

  const columns: Array<DataTableColumn<AdminReviewItem>> = [
    { key: "rating", header: "Đánh giá", render: (review) => <Stars value={review.rating} /> },
    { key: "comment", header: "Nội dung", width: "30%", render: (review) => <p className={`line-clamp-2 ${review.hidden_at ? "text-danger line-through" : review.comment ? "text-ink" : "italic text-muted"}`}>{review.comment || "Không có nhận xét"}</p> },
    { key: "reviewer", header: "Người đánh giá", render: (review) => review.reviewer.name, hideOnMobile: true },
    { key: "reviewed_user_name", header: "Người bán", hideOnMobile: true },
    { key: "order_code", header: "Đơn hàng", render: (review) => <code className="whitespace-nowrap text-xs text-brand">{review.order_code}</code>, hideOnMobile: true },
    { key: "created_at", header: "Ngày", render: (review) => <div className="flex items-center justify-between gap-1"><time dateTime={review.created_at} className="text-muted">{formatDateTime(review.created_at)}</time><RowAction className="admin-row-icon" label="Xem đánh giá" onClick={() => apply({ selected: review.id })}><Icon name="eye" size={15} /></RowAction></div> },
  ];

  return <div className="admin-stack">
    <AdminHeading title="Đánh giá" description="Kiểm tra nội dung đánh giá; quản trị viên chỉ có thể ẩn, không sửa nội dung hoặc số sao." />
    <section className="review-summary" aria-label="Thống kê đánh giá"><AdminMetrics metrics={[
      { label: "Điểm trung bình", value: summary?.average?.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }), icon: "star", tone: "warning", unit: "/ 5", note: summary?.average != null && <Stars value={Math.round(summary.average)} /> },
      { label: "Tổng đánh giá", value: summary?.total, icon: "chat", note: "Tất cả đánh giá đã gửi" },
      { label: "Đánh giá cần xem xét", value: summary?.low_rating_visible, icon: "info", tone: summary?.low_rating_visible === 0 ? "brand" : "danger", note: "Đánh giá công khai từ 1 đến 2 sao" },
      { label: "Đang hiển thị công khai", value: formatAdminPercent(summary?.public_rate), icon: "eye", note: summary?.public_rate != null && <progress className="admin-progress" max={100} value={summary.public_rate} aria-label="Tỷ lệ đang hiển thị công khai" /> },
    ]} /></section>
    <div className="admin-panel">
      <AdminToolbar className="admin-search-inline">
        <SearchInput value={search} onValueChange={setSearch} onSubmit={() => apply({ q: search.trim() || null })} placeholder="Tìm trong nội dung đánh giá" label="Tìm đánh giá" />
        <ToolbarField label="Số sao" htmlFor="review-rating"><Select id="review-rating" value={rating ?? ""} onChange={(event) => apply({ rating: event.target.value || null })}><option value="">Tất cả</option>{[5,4,3,2,1].map((value) => <option key={value} value={value}>{value} sao</option>)}</Select></ToolbarField>
        <ToolbarField label="Hiển thị" htmlFor="review-visibility"><Select id="review-visibility" value={visibility ?? ""} onChange={(event) => apply({ visibility: event.target.value || null })}><option value="">Tất cả</option><option value="VISIBLE">Đang hiển thị</option><option value="HIDDEN">Đã ẩn</option></Select></ToolbarField>
<AdminAdvancedFilters fields={["handled_by", "from", "to"]}>
        <ToolbarField label="Từ ngày" htmlFor="review-from"><Input id="review-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
        <ToolbarField label="Người xử lý" htmlFor="review-handler"><Input id="review-handler" value={params.get("handled_by") ?? ""} onChange={(event) => apply({ handled_by: event.target.value || null })} placeholder="UUID quản trị viên" /></ToolbarField>
        <ToolbarField label="Đến ngày" htmlFor="review-to"><Input id="review-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField></AdminAdvancedFilters>
      </AdminToolbar>
    </div>
    {query.isError ? <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} /> : <SectionCard className="admin-table-panel" bodyClassName="p-0 lg:p-0">
      {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} loading={query.isPending} onRowClick={(row) => apply({ selected: row.id })} empty={<EmptyState title="Không có đánh giá phù hợp" description="Hãy thay đổi từ khóa hoặc số sao." />} />}
      {query.data && <AdminPagination meta={query.data.meta} shown={query.data.items.length} resource="đánh giá" onPageChange={(next) => apply({ page: String(next) })} />}
    </SectionCard>}
    <Drawer open={selected !== null} onClose={() => apply({ selected: null }, { replace: true })} title="Chi tiết đánh giá" footer={selected && !selected.hidden_at ? <Button variant="danger" onClick={() => setConfirmHide(true)}>Ẩn đánh giá</Button> : undefined}>
      {selected && <div className="space-y-5"><div className="flex items-center justify-between gap-3"><Stars value={selected.rating} /><StatusBadge label={selected.hidden_at ? "Đã ẩn" : "Đang hiển thị"} tone={selected.hidden_at ? "neutral" : "brand"} /></div><div className="rounded-card bg-surface-subtle p-4 whitespace-pre-wrap t-body text-ink">{selected.comment ?? "Không có nhận xét."}</div><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="t-meta text-muted">Người đánh giá</dt><dd className="mt-1 t-body">{selected.reviewer.name}</dd></div><div><dt className="t-meta text-muted">Người bán</dt><dd className="mt-1 t-body">{selected.reviewed_user_name}</dd></div><div><dt className="t-meta text-muted">Đơn hàng</dt><dd className="mt-1 t-body">{selected.order_code}</dd></div><div><dt className="t-meta text-muted">Ngày đánh giá</dt><dd className="mt-1 t-body">{formatDateTime(selected.created_at)}</dd></div></dl>{selected.hidden_at && <div className="rounded-card bg-danger-bg p-4"><p className="t-label text-danger">Lý do ẩn</p><p className="mt-1 t-body">{selected.hidden_reason}</p><p className="mt-2 t-meta text-muted">Ẩn lúc {formatDateTime(selected.hidden_at)}</p></div>}</div>}
    </Drawer>
    {selected && confirmHide && <ConfirmDialog title="Ẩn đánh giá này?" description="Đánh giá sẽ không còn được tính vào điểm trung bình của người bán. MVP không có thao tác khôi phục." confirmLabel="Ẩn đánh giá" loading={mutation.isPending} onConfirm={() => mutation.mutate()} onCancel={() => { setConfirmHide(false); setReason(""); }} reasonField={{ label: "Lý do ẩn", required: true, value: reason, onChange: setReason, placeholder: "Nêu nội dung vi phạm" }} />}
  </div>;
}
