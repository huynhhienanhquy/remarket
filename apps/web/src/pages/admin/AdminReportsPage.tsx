import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminReportItem, ReportReason, ReportStatus } from "@remarket/shared";
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, formatDateTime } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { Button, ConfirmDialog, Drawer, EmptyState, Input, Pagination, SectionCard, Select, StatusBadge, Tabs, useToast } from "../../components/ui";
import type { DataTableColumn } from "../../components/ui";
import { AdminDataTable as DataTable, AdminHeading, AdminAdvancedFilters, AdminToolbar, QueryErrorAlert, RowAction, ToolbarField, errorDescription, readPage, useAdminParams } from "./adminShared";

const REPORT_TABS = [
  { value: "PENDING", label: "Chờ xử lý" },
  { value: "RESOLVED", label: "Đã xử lý" },
  { value: "REJECTED", label: "Không chấp nhận" },
];

export function AdminReportsPage() {
  const { params, apply } = useAdminParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const page = readPage(params);
  const status = REPORT_TABS.some((tab) => tab.value === params.get("status")) ? params.get("status")! as ReportStatus : "PENDING";
  const selectedId = params.get("selected");
  const [decision, setDecision] = useState<"resolve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [resolutionAction, setResolutionAction] = useState<"none" | "block_product" | "lock_user">("none");
  const reason = params.get("reason") as ReportReason | null;
  const targetType = params.get("target_type") as "product" | "user" | null;
  const queryInput = useMemo(() => ({ status, ...(reason ? { reason } : {}), ...(targetType ? { target_type: targetType } : {}), ...(params.get("handled_by") ? { handled_by: params.get("handled_by")! } : {}), ...(params.get("from") ? { from: params.get("from")! } : {}), ...(params.get("to") ? { to: params.get("to")! } : {}), page }), [status, reason, targetType, params, page]);
  const query = useQuery({ queryKey: queryKeys.adminReports(queryInput), queryFn: () => api.admin.reports(queryInput) });
  const selected = query.data?.items.find((report) => report.id === selectedId) ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected || !decision) throw new Error("Thiếu báo cáo cần xử lý.");
      return decision === "resolve" ? api.admin.resolveReport(selected.id, { resolution_note: note, action: resolutionAction }) : api.admin.rejectReport(selected.id, { resolution_note: note });
    },
    onSuccess: (report) => {
      queryClient.setQueriesData<{ items: AdminReportItem[]; meta: unknown }>({ queryKey: ["admin", "reports"] }, (current) => current ? { ...current, items: current.items.map((item) => item.id === report.id ? report : item) } : current);
      void queryClient.invalidateQueries({ queryKey: ["admin", "dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","reports"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","products"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","users","list"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["admin","audit"] });
      toast.success(decision === "resolve" ? "Đã xử lý báo cáo" : "Đã không chấp nhận báo cáo");
      setDecision(null); setNote(""); setResolutionAction("none");
    },
    onError: (error) => toast.error("Không thể xử lý báo cáo", { description: errorDescription(error) }),
  });

  const columns: Array<DataTableColumn<AdminReportItem>> = [
    { key: "id", header: "Mã report", render: (report) => <span className="font-mono t-meta text-ink">{report.id.slice(0, 8)}…</span> },
    { key: "target_label", header: "Đối tượng", render: (report) => <div className="min-w-[200px]"><p className="line-clamp-2 t-label text-ink">{report.target_label}</p><p className="t-meta text-muted">{report.target_type === "product" ? "Tin đăng" : "Người dùng"}</p></div> },
    { key: "reason", header: "Lý do", render: (report) => REPORT_REASON_LABELS[report.reason], hideOnMobile: true },
    { key: "reporter_name", header: "Người gửi", hideOnMobile: true },
    { key: "status", header: "Trạng thái", render: (report) => <StatusBadge label={REPORT_STATUS_LABELS[report.status].label} tone={REPORT_STATUS_LABELS[report.status].tone} size="sm" /> },
    { key: "created_at", header: "Thời gian", render: (report) => formatDateTime(report.created_at), hideOnMobile: true },
    { key: "updated_at", header: "Thao tác", render: (report) => <RowAction onClick={() => apply({ selected: report.id })}>Xem</RowAction> },
  ];

  return <div>
    <AdminHeading title="Báo cáo" description="Xem nội dung, đối tượng bị báo cáo và ghi kết luận xử lý có audit." />
    <SectionCard bodyClassName="p-0 lg:p-0">
      <Tabs tabs={REPORT_TABS} value={status} onChange={(value) => apply({ status: value === "PENDING" ? null : value })} ariaLabel="Trạng thái báo cáo" />
      <div className="p-4 lg:p-6"><AdminToolbar>
        <ToolbarField label="Đối tượng" htmlFor="report-target"><Select id="report-target" value={targetType ?? ""} onChange={(event) => apply({ target_type: event.target.value || null })}><option value="">Tất cả</option><option value="product">Tin đăng</option><option value="user">Người dùng</option></Select></ToolbarField>
        <ToolbarField label="Lý do" htmlFor="report-reason"><Select id="report-reason" value={reason ?? ""} onChange={(event) => apply({ reason: event.target.value || null })}><option value="">Tất cả</option>{Object.entries(REPORT_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></ToolbarField>
<AdminAdvancedFilters fields={["handled_by", "from", "to"]}>
        <ToolbarField label="Người xử lý" htmlFor="report-handler"><Input id="report-handler" value={params.get("handled_by") ?? ""} onChange={(event) => apply({ handled_by: event.target.value || null })} placeholder="UUID quản trị viên" /></ToolbarField>
        <ToolbarField label="Từ ngày" htmlFor="report-from"><Input id="report-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
        <ToolbarField label="Đến ngày" htmlFor="report-to"><Input id="report-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField></AdminAdvancedFilters>
      </AdminToolbar></div>
      {query.isError && <div className="p-4 lg:p-6"><QueryErrorAlert error={query.error} onRetry={() => query.refetch()} /></div>}
      {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} loading={query.isPending} onRowClick={(row) => apply({ selected: row.id })} empty={<EmptyState title="Không có báo cáo" description="Không có báo cáo phù hợp với trạng thái đã chọn." />} />}
      {query.data && <Pagination className="p-4 lg:px-6" page={query.data.meta.page} totalPages={query.data.meta.total_pages} total={query.data.meta.total} onPageChange={(next) => apply({ page: String(next) })} />}
    </SectionCard>
    <Drawer open={selected !== null} onClose={() => apply({ selected: null }, { replace: true })} title="Chi tiết báo cáo" footer={selected?.status === "PENDING" ? <><Button variant="secondary" onClick={() => setDecision("reject")}>Không chấp nhận</Button><Button onClick={() => setDecision("resolve")}>Xử lý báo cáo</Button></> : undefined}>
      {selected && <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2"><StatusBadge label={REPORT_STATUS_LABELS[selected.status].label} tone={REPORT_STATUS_LABELS[selected.status].tone} /><span className="t-meta text-muted">{formatDateTime(selected.created_at)}</span></div>
        <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="t-meta text-muted">Đối tượng</dt><dd className="mt-1 t-body text-ink">{selected.target_label}</dd><dd className="break-all t-meta text-muted">{selected.target_id}</dd></div><div><dt className="t-meta text-muted">Người gửi</dt><dd className="mt-1 t-body text-ink">{selected.reporter_name}</dd></div><div><dt className="t-meta text-muted">Lý do</dt><dd className="mt-1 t-body text-ink">{REPORT_REASON_LABELS[selected.reason]}</dd></div><div><dt className="t-meta text-muted">Mã báo cáo</dt><dd className="mt-1 break-all t-meta text-ink">{selected.id}</dd></div></dl>
        <div><p className="t-label text-ink">Mô tả từ người báo cáo</p><div className="mt-2 rounded-card bg-surface-subtle p-4 whitespace-pre-wrap t-body text-ink">{selected.description ?? "Không có mô tả bổ sung."}</div></div>
        {selected.resolution_note && <div className="rounded-card border border-brand/30 bg-brand-soft p-4"><p className="t-label text-brand">Kết luận xử lý</p><p className="mt-1 whitespace-pre-wrap t-body text-ink">{selected.resolution_note}</p><p className="mt-2 t-meta text-muted">{selected.handled_by_name ?? "Quản trị viên"} · {formatDateTime(selected.handled_at)}</p></div>}
      </div>}
    </Drawer>
    {selected && decision && <ConfirmDialog title={decision === "resolve" ? "Xử lý báo cáo" : "Không chấp nhận báo cáo"} description={decision === "resolve" ? <div className="space-y-3"><p>Chọn hành động phù hợp với đối tượng. Thao tác và kết luận được ghi audit trong cùng luồng xử lý.</p><label className="block t-label text-ink" htmlFor="report-action">Hành động</label><Select id="report-action" value={resolutionAction} onChange={(event) => setResolutionAction(event.target.value as typeof resolutionAction)}><option value="none">Chỉ ghi kết luận</option>{selected.target_type === "product" && <option value="block_product">Hạn chế tin đăng</option>}{selected.target_type === "user" && <option value="lock_user">Khóa tài khoản</option>}</Select></div> : "Báo cáo sẽ được đánh dấu không được chấp nhận; đối tượng không bị thay đổi."} confirmLabel={decision === "resolve" ? "Xác nhận xử lý" : "Không chấp nhận"} tone={decision === "resolve" ? "primary" : "danger"} loading={mutation.isPending} onConfirm={() => mutation.mutate()} onCancel={() => { setDecision(null); setNote(""); setResolutionAction("none"); }} reasonField={{ label: decision === "resolve" ? "Kết luận xử lý" : "Lý do không chấp nhận", required: true, value: note, onChange: setNote, placeholder: "Ghi kết luận rõ ràng để thông báo cho người báo cáo" }} />}
  </div>;
}
