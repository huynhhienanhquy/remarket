import type { AdminReportItem, ReportReason, ReportStatus } from "@remarket/shared";
import { REPORT_REASON_LABELS, REPORT_STATUS_LABELS, formatDateTime } from "@remarket/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AdminDataTable as DataTable } from "../../components/admin/AdminDataTable/AdminDataTable";
import { AdminPagination } from "../../components/admin/AdminPagination/AdminPagination";
import { AdminHeading } from "../../components/admin/AdminHeading/AdminHeading";
import { AdminAvatar, AdminMetrics, AdminNotice, AdminPill } from "../../components/admin/AdminSummary/AdminSummary";
import { AdminAdvancedFilters, AdminToolbar, ToolbarField } from "../../components/admin/AdminToolbar/AdminToolbar";
import { QueryErrorAlert } from "../../components/admin/QueryErrorAlert/QueryErrorAlert";
import { RowAction } from "../../components/admin/RowAction/RowAction";
import type { DataTableColumn } from "../../components/common/DataTable/DataTable";
import { Button } from "../../components/common/Button/Button";
import { ConfirmDialog, Dialog } from "../../components/common/Dialog/Dialog";
import { Drawer } from "../../components/common/Drawer/Drawer";
import { EmptyState } from "../../components/common/EmptyState/EmptyState";
import { Icon } from "../../components/common/Icon/Icon";
import { Input, Select } from "../../components/common/Input/Input";
import { SectionCard } from "../../components/common/SectionCard/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge/StatusBadge";
import { Tabs } from "../../components/common/Tabs/Tabs";
import { useToast } from "../../components/common/Toast/Toast";
import { queryKeys } from "../../config/queryClient";
import { invalidateAdminResources, patchAdminRows } from "../../helpers/adminCache";
import { errorDescription } from "../../helpers/adminErrors";
import { useAdminParams } from "../../hooks/useAdminParams";
import { formatAdminPercent, useAdminQueueCounts, useAdminSummary } from "../../hooks/useAdminSummary";
import { api, apiForQuery } from "../../services/api";
import { readPage } from "../../utils/adminParams";

const REPORT_TABS = [
  { value: "PENDING", label: "Chờ xử lý" },
  { value: "RESOLVED", label: "Đã xử lý" },
  { value: "REJECTED", label: "Không chấp nhận" },
];

export function AdminReportsPage() {
  const { params, apply } = useAdminParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const pending = useAdminQueueCounts()?.pending_reports;
  const { data: summary } = useAdminSummary("reports");
  const page = readPage(params);
  const status = REPORT_TABS.some((tab) => tab.value === params.get("status")) ? params.get("status")! as ReportStatus : "PENDING";
  const selectedId = params.get("selected");
  const [decision, setDecision] = useState<"resolve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [resolutionAction, setResolutionAction] = useState<"none" | "block_product" | "lock_user">("none");
  const reason = params.get("reason") as ReportReason | null;
  const targetType = params.get("target_type") as "product" | "user" | null;
  const queryInput = useMemo(() => ({ status, ...(reason ? { reason } : {}), ...(targetType ? { target_type: targetType } : {}), ...(params.get("handled_by") ? { handled_by: params.get("handled_by")! } : {}), ...(params.get("from") ? { from: params.get("from")! } : {}), ...(params.get("to") ? { to: params.get("to")! } : {}), page }), [status, reason, targetType, params, page]);
  const query = useQuery({ queryKey: queryKeys.adminReports(queryInput), queryFn: ({ signal }) => apiForQuery(signal).admin.reports(queryInput) });
  const selected = query.data?.items.find((report) => report.id === selectedId) ?? null;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selected || !decision) throw new Error("Thiếu báo cáo cần xử lý.");
      return decision === "resolve" ? api.admin.resolveReport(selected.id, { resolution_note: note, action: resolutionAction }) : api.admin.rejectReport(selected.id, { resolution_note: note });
    },
    onSuccess: (report) => {
      patchAdminRows(queryClient, "reports", report);
      void invalidateAdminResources(queryClient, "dashboard", "reports", "products", "users", "tickets", "audit");
      toast.success(decision === "resolve" ? "Đã xử lý báo cáo" : "Đã không chấp nhận báo cáo");
      setDecision(null); setNote(""); setResolutionAction("none");
    },
    onError: (error) => toast.error("Không thể xử lý báo cáo", { description: errorDescription(error) }),
  });

  const columns: Array<DataTableColumn<AdminReportItem>> = [
    { key: "id", header: "Mã report", render: (report) => <span className="font-mono t-meta text-ink">{report.id.slice(0, 8)}…</span> },
    { key: "target_label", header: "Đối tượng", width: "19%", render: (report) => <div className="flex items-center gap-2.5"><AdminAvatar name={report.target_label} small /><div className="min-w-0"><p className="line-clamp-2 t-label text-ink">{report.target_label}</p><p className="t-meta text-muted">{report.target_type === "product" ? "Tin đăng" : "Người dùng"}</p></div></div> },
    { key: "reason", header: "Lý do", render: (report) => <span className="admin-inline-icon"><Icon name="alert-triangle" size={14} className="shrink-0 text-danger" />{REPORT_REASON_LABELS[report.reason]}</span>, hideOnMobile: true },
    { key: "reporter_name", header: "Người gửi", hideOnMobile: true },
    { key: "status", header: "Trạng thái", render: (report) => <AdminPill tone={REPORT_STATUS_LABELS[report.status].tone} dot>{REPORT_STATUS_LABELS[report.status].label}</AdminPill> },
    { key: "created_at", header: "Thời gian", render: (report) => <time dateTime={report.created_at} className="text-muted">{formatDateTime(report.created_at)}</time>, hideOnMobile: true },
    { key: "updated_at", header: "Thao tác", render: (report) => <RowAction onClick={() => apply({ selected: report.id })}>Xem <Icon name="eye" size={15} /></RowAction> },
  ];

  return <div className="admin-stack">
    <AdminHeading title="Báo cáo" description="Xem nội dung, đối tượng bị báo cáo và ghi kết luận xử lý có audit." />
    <AdminMetrics columns={3} metrics={[
      { label: "Chờ xử lý", value: pending, icon: "clock", tone: "warning", note: "Cần kiểm duyệt" },
      { label: "Đã xử lý hôm nay", value: summary?.handled_today, icon: "check", note: "Đã ghi kết luận trong nhật ký" },
      { label: "Tỷ lệ vi phạm xác thực", value: formatAdminPercent(summary?.confirmed_rate), icon: "flag", note: "Trên các báo cáo đã xử lý" },
    ]} />
    <SectionCard className="admin-section-flush" bodyClassName="p-0 lg:p-0">
      <Tabs tabs={REPORT_TABS.map(item => {
        const count = item.value === "PENDING" ? pending : item.value === "RESOLVED" ? summary?.resolved : undefined;
        return { ...item, label: count == null ? item.label : <span className="admin-inline-icon">{item.label}<span className="admin-tab-count" aria-hidden="true">{count}</span></span> };
      })} value={status} onChange={(value) => apply({ status: value === "PENDING" ? null : value })} ariaLabel="Trạng thái báo cáo" />
      <AdminToolbar>
        <ToolbarField label="Đối tượng" htmlFor="report-target"><Select id="report-target" value={targetType ?? ""} onChange={(event) => apply({ target_type: event.target.value || null })}><option value="">Tất cả</option><option value="product">Tin đăng</option><option value="user">Người dùng</option></Select></ToolbarField>
        <ToolbarField label="Lý do" htmlFor="report-reason"><Select id="report-reason" value={reason ?? ""} onChange={(event) => apply({ reason: event.target.value || null })}><option value="">Tất cả</option>{Object.entries(REPORT_REASON_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></ToolbarField>
<AdminAdvancedFilters fields={["handled_by", "from", "to"]}>
        <ToolbarField label="Người xử lý" htmlFor="report-handler"><Input id="report-handler" value={params.get("handled_by") ?? ""} onChange={(event) => apply({ handled_by: event.target.value || null })} placeholder="UUID quản trị viên" /></ToolbarField>
        <ToolbarField label="Từ ngày" htmlFor="report-from"><Input id="report-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
        <ToolbarField label="Đến ngày" htmlFor="report-to"><Input id="report-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField></AdminAdvancedFilters>
      </AdminToolbar>
    </SectionCard>
    {query.isError ? <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} /> : <SectionCard className="admin-table-panel" bodyClassName="p-0 lg:p-0">
      {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} loading={query.isPending} onRowClick={(row) => apply({ selected: row.id })} empty={<EmptyState title="Không có báo cáo" description="Không có báo cáo phù hợp với trạng thái đã chọn." />} />}
      {query.data && <AdminPagination meta={query.data.meta} shown={query.data.items.length} onPageChange={(next) => apply({ page: String(next) })} />}
    </SectionCard>}
    <AdminNotice title="Quy chuẩn xử lý vi phạm & Audit an toàn" action={<button type="button" className="admin-utility shrink-0" onClick={() => setGuideOpen(true)}>Xem tài liệu quy chế</button>}>
      Khi xử lý hoặc không chấp nhận báo cáo, hệ thống ghi lại quản trị viên thực hiện và kết luận. Đối chiếu nội dung, ảnh sản phẩm và trao đổi với các bên trước khi quyết định hạn chế tin hoặc khóa tài khoản.
    </AdminNotice>
    <Dialog open={guideOpen} onClose={() => setGuideOpen(false)} title="Quy chuẩn xử lý vi phạm"
      footer={<Link to="/admin/audit" className="admin-utility">Xem nhật ký hệ thống</Link>}>
      <ol className="list-decimal space-y-2 pl-5">
        <li>Kiểm tra lý do, đối tượng và mô tả báo cáo.</li>
        <li>Chọn kết luận và hành động phù hợp với bằng chứng đã xác minh.</li>
        <li>Ghi rõ lý do xử lý để người báo cáo hiểu kết quả và quản trị viên có thể đối soát trong nhật ký.</li>
      </ol>
    </Dialog>
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
