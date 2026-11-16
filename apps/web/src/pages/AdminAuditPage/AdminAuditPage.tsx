import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuditLogItem } from "@remarket/shared";
import { formatDate, formatDateTime } from "@remarket/shared";
import { apiForQuery } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { Drawer } from "../../components/common/Drawer/Drawer";
import { EmptyState } from "../../components/common/EmptyState/EmptyState";
import { Icon } from "../../components/common/Icon/Icon";
import { Input, Select } from "../../components/common/Input/Input";
import { SearchInput } from "../../components/common/SearchInput/SearchInput";
import { SectionCard } from "../../components/common/SectionCard/SectionCard";
import type { DataTableColumn } from "../../components/common/DataTable/DataTable";
import { AdminDataTable as DataTable } from "../../components/admin/AdminDataTable/AdminDataTable";
import { AdminPagination } from "../../components/admin/AdminPagination/AdminPagination";
import { AdminHeading } from "../../components/admin/AdminHeading/AdminHeading";
import { AdminAdvancedFilters, AdminToolbar, ToolbarField } from "../../components/admin/AdminToolbar/AdminToolbar";
import { QueryErrorAlert } from "../../components/admin/QueryErrorAlert/QueryErrorAlert";
import { AdminAvatar, AdminMetrics, AdminNotice, AdminPill } from "../../components/admin/AdminSummary/AdminSummary";
import { exportAdminCsv } from "../../helpers/exportAdminCsv";
import { useAdminSummary } from "../../hooks/useAdminSummary";
import { isoDay } from "../AdminDashboardPage/dateRange";
import { RowAction } from "../../components/admin/RowAction/RowAction";
import { readEnumParam, readPage } from "../../utils/adminParams";
import { useAdminParams } from "../../hooks/useAdminParams";

function safeMetadata(metadata: Record<string, unknown>): string {
  return JSON.stringify(metadata, null, 2);
}

const ACTION_LABELS: Record<string, string> = {
  "product.approve": "Duyệt sản phẩm",
  "product.reject": "Từ chối sản phẩm",
  "product.block": "Hạn chế sản phẩm",
  "product.unblock": "Gỡ hạn chế sản phẩm",
  "user.email_verified": "Xác minh email",
  "user.create": "Thêm người dùng",
  "user.lock": "Khóa tài khoản",
  "user.unlock": "Mở khóa tài khoản",
  "report.resolve": "Xử lý báo cáo",
  "report.reject": "Từ chối báo cáo",
  "category.create": "Thêm danh mục",
  "category.update": "Cập nhật danh mục",
  "category.disable": "Vô hiệu danh mục",
  "review.hide": "Ẩn đánh giá",
  "ticket.reply": "Phản hồi hỗ trợ",
  "order.cancel": "Hủy đơn hàng",
};

const ACTOR_LABELS = { USER: "Người dùng", ADMIN: "Quản trị viên", SYSTEM: "Hệ thống" } as const;
const ENTITY_LABELS: Record<string, string> = { user: "Tài khoản", product: "Tin đăng", report: "Báo cáo", category: "Danh mục", order: "Đơn hàng", review: "Đánh giá", support_ticket: "Yêu cầu hỗ trợ" };
const auditTime = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const rangeOptions = [{ days: 1, label: "Hôm nay" }, { days: 7, label: "7 ngày qua" }, { days: 30, label: "30 ngày qua" }];

function dateRange(days: number) {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return { from: isoDay(from), to: isoDay(to) };
}

function actionLabel(action: string) {
  return Object.hasOwn(ACTION_LABELS, action) ? ACTION_LABELS[action] : action;
}

function storageLabel(bytes: number | undefined) {
  if (bytes === undefined) return undefined;
  const [divisor, unit] = bytes >= 1e9 ? [1e9, "GB"] : bytes >= 1e6 ? [1e6, "MB"] : [1e3, "KB"];
  return (bytes / divisor).toLocaleString("vi-VN", { maximumFractionDigits: 1 }) + " " + unit;
}

export function AdminAuditPage() {
  const { params, apply } = useAdminParams();
  const { data: summary } = useAdminSummary("audit");
  const page = readPage(params);
  const selectedId = params.get("selected");
  const keyword = params.get("q") ?? "";
  const [search, setSearch] = useState(keyword);
  const action = params.get("action") ?? "";
  const actorType = readEnumParam(params, "actor_type", ["USER", "ADMIN", "SYSTEM"] as const);
  const customDates = params.has("from") || params.has("to");
  const today = dateRange(1);
  const from = customDates ? params.get("from") : today.from;
  const to = customDates ? params.get("to") : today.to;
  const activeRange = rangeOptions.find(option => {
    const range = dateRange(option.days);
    return range.from === from && range.to === to;
  });
  const [advanced, setAdvanced] = useState(() => !activeRange && ["entity_type", "entity_id", "actor_id", "from", "to"].some(field => params.has(field)));
  useEffect(() => setSearch(keyword), [keyword]);

  const queryInput = useMemo(() => ({
    ...(action ? { action } : {}),
    ...(keyword ? { q: keyword } : {}),
    ...(actorType ? { actor_type: actorType } : {}),
    ...(params.get("entity_type") ? { entity_type: params.get("entity_type")! } : {}),
    ...(params.get("entity_id") ? { entity_id: params.get("entity_id")! } : {}),
    ...(params.get("actor_id") ? { actor_id: params.get("actor_id")! } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    page,
  }), [action, keyword, actorType, params, from, to, page]);
  const query = useQuery({ queryKey: queryKeys.adminAudit(queryInput), queryFn: ({ signal }) => apiForQuery(signal).admin.audit(queryInput) });
  const selected = query.data?.items.find(entry => entry.id === selectedId) ?? null;

  const columns: Array<DataTableColumn<AuditLogItem>> = [
    { key: "created_at", header: "Thời gian", width: "10%", render: entry => <time dateTime={entry.created_at}>
      <span className="block">{auditTime.format(new Date(entry.created_at))}</span><span className="t-meta text-muted">{formatDate(entry.created_at)}</span>
    </time> },
    { key: "actor_name", header: "Người thực hiện", width: "20%", render: entry => <div className="flex items-center gap-2.5"><AdminAvatar name={entry.actor_name ?? "Hệ thống"} tone={entry.actor_type === "ADMIN" ? "solid" : undefined} small /><div><p className="font-medium">{entry.actor_name ?? "Hệ thống"}</p><p className="t-meta text-muted">{ACTOR_LABELS[entry.actor_type]}</p></div></div> },
    { key: "action", header: "Loại hành động", width: "19%", render: entry => <AdminPill tone={entry.action === "user.email_verified" ? "info" : entry.action.endsWith(".reject") || entry.action.endsWith(".block") || entry.action === "user.lock" ? "warning" : "brand"} dot>{actionLabel(entry.action)}</AdminPill> },
    { key: "entity_type", header: "Đối tượng tác động", width: "15%", render: entry => {
      const entity = entry.entity_type.toLowerCase();
      return <div><p className="font-medium">{Object.hasOwn(ENTITY_LABELS, entity) ? ENTITY_LABELS[entity] : entry.entity_type}</p><p className="max-w-[125px] truncate font-mono t-meta text-muted" title={entry.entity_id ?? undefined}>{entry.entity_id ?? "—"}</p></div>;
    }, hideOnMobile: true },
    { key: "reason", header: "Chi tiết hành động", render: entry => <div className="flex items-center justify-between gap-2"><div className="min-w-0">
      <p className="line-clamp-2">{entry.reason ?? actionLabel(entry.action)}</p>
      {typeof entry.metadata.status === "string" && <p className="t-meta text-muted">Trạng thái: {entry.metadata.status}</p>}
    </div><RowAction className="admin-row-icon" label="Xem chi tiết nhật ký" onClick={() => apply({ selected: entry.id })}><Icon name="eye" size={15} /></RowAction></div> },
  ];

  return <div className="admin-stack">
    <AdminHeading title="Nhật ký hệ thống" description="Ghi nhận và lưu vết toàn bộ hoạt động kiểm duyệt, thay đổi dữ liệu và tác vụ quản trị để phục vụ đối soát, an ninh."
      badge={<AdminPill>Audit Logs</AdminPill>}
      actions={<>
        <button type="button" className="admin-utility" title="Xuất sự kiện trên trang hiện tại" disabled={!query.data?.items.length} onClick={() => {
          exportAdminCsv("nhat-ky.csv", ["Thời gian", "Người thực hiện", "Loại người thực hiện", "Hành động", "Đối tượng", "Mã đối tượng", "Lý do"],
            (query.data?.items ?? []).map(entry => [entry.created_at, entry.actor_name, entry.actor_type, entry.action, entry.entity_type, entry.entity_id, entry.reason]));
        }}><Icon name="download" size={16} />Xuất nhật ký (CSV)</button>
        <button type="button" className="admin-utility admin-soft-button" disabled={query.isFetching} onClick={() => void query.refetch()}><Icon name="refresh" size={16} />Làm mới</button>
      </>} />
    <AdminMetrics columns={3} metrics={[
      { label: "Tổng sự kiện hôm nay", value: summary?.today, icon: "history" },
      { label: "Thao tác quản trị viên", value: summary?.admin_actions_today, icon: "shield", note: "Trong ngày hôm nay" },
      { label: "Dung lượng lưu trữ log", value: storageLabel(summary?.storage_bytes), icon: "archive", note: summary && summary.total.toLocaleString("vi-VN") + " sự kiện lưu trữ" },
    ]} />
    <div className="admin-panel">
      <AdminToolbar className="audit-toolbar">
        <SearchInput label="Tìm theo người thực hiện" value={search} onValueChange={setSearch} onSubmit={() => apply({ q: search.trim() || null })} placeholder="Tìm theo người thực hiện" />
        <Select aria-label="Loại hành động" value={action} onChange={event => apply({ action: event.target.value || null })}>
          <option value="">Loại hành động: Tất cả</option>
          {action && !Object.hasOwn(ACTION_LABELS, action) && <option value={action}>{action}</option>}
          {Object.entries(ACTION_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </Select>
        <Select aria-label="Loại người thực hiện" value={actorType} onChange={event => apply({ actor_type: event.target.value || null })}>
          <option value="">Vai trò: Tất cả</option>
          {Object.entries(ACTOR_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
        </Select>
        <div className="audit-range" aria-label="Khoảng thời gian">
          {rangeOptions.map(option => <button key={option.days} type="button" aria-pressed={activeRange?.days === option.days} onClick={() => { apply(dateRange(option.days)); setAdvanced(false); }}>{option.label}</button>)}
          <button type="button" aria-expanded={advanced} onClick={() => setAdvanced(true)}>Tùy chọn <Icon name="clock" size={14} /></button>
        </div>
        <AdminAdvancedFilters open={advanced} onOpenChange={setAdvanced} fields={["entity_type", "entity_id", "actor_id", "from", "to"]} summary="Đang hiển thị các bản ghi mới nhất">
          <ToolbarField label="Loại đối tượng" htmlFor="audit-entity"><Input id="audit-entity" value={params.get("entity_type") ?? ""} onChange={event => apply({ entity_type: event.target.value || null }, { replace: true })} placeholder="product, user, report…" /></ToolbarField>
          <ToolbarField label="Mã đối tượng" htmlFor="audit-entity-id"><Input id="audit-entity-id" value={params.get("entity_id") ?? ""} onChange={event => apply({ entity_id: event.target.value || null }, { replace: true })} placeholder="UUID đối tượng" /></ToolbarField>
          <ToolbarField label="Mã người thực hiện" htmlFor="audit-actor-id"><Input id="audit-actor-id" value={params.get("actor_id") ?? ""} onChange={event => apply({ actor_id: event.target.value || null }, { replace: true })} placeholder="UUID người thực hiện" /></ToolbarField>
          <ToolbarField label="Từ ngày" htmlFor="audit-from"><Input id="audit-from" type="date" value={from ?? ""} max={to ?? undefined} onChange={event => apply({ from: event.target.value || null })} /></ToolbarField>
          <ToolbarField label="Đến ngày" htmlFor="audit-to"><Input id="audit-to" type="date" value={to ?? ""} min={from ?? undefined} onChange={event => apply({ to: event.target.value || null })} /></ToolbarField>
        </AdminAdvancedFilters>
      </AdminToolbar>
    </div>
    {query.isError ? <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} /> : <SectionCard className="admin-table-panel" bodyClassName="p-0 lg:p-0">
      <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={row => row.id} loading={query.isPending} onRowClick={row => apply({ selected: row.id })} empty={<EmptyState title="Không có nhật ký phù hợp" description="Hãy thay đổi khoảng ngày hoặc bộ lọc." />} />
      {query.data && <AdminPagination meta={query.data.meta} shown={query.data.items.length} resource="sự kiện" showArrows={false} onPageChange={next => apply({ page: String(next) })} />}
    </SectionCard>}
    <AdminNotice title="Lưu trữ và toàn vẹn dữ liệu">Dùng mã đối tượng, thời gian và người thực hiện để đối chiếu các thay đổi đã được ghi nhận.</AdminNotice>
    <Drawer open={selected !== null} onClose={() => apply({ selected: null }, { replace: true })} title="Chi tiết nhật ký">
      {selected && <div className="space-y-5"><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="t-meta text-muted">Thời gian</dt><dd className="t-body">{formatDateTime(selected.created_at)}</dd></div><div><dt className="t-meta text-muted">Người thực hiện</dt><dd className="t-body">{selected.actor_name ?? "Hệ thống"} ({selected.actor_type})</dd></div><div><dt className="t-meta text-muted">Hành động</dt><dd><code className="t-meta">{selected.action}</code></dd></div><div><dt className="t-meta text-muted">Đối tượng</dt><dd className="t-body">{selected.entity_type}</dd><dd className="break-all font-mono t-meta text-muted">{selected.entity_id ?? "—"}</dd></div></dl><div><p className="t-label text-ink">Lý do</p><p className="mt-1 whitespace-pre-wrap t-body">{selected.reason ?? "Không có lý do riêng."}</p></div><div><p className="t-label text-ink">Metadata đã lọc từ server</p><pre className="mt-2 overflow-x-auto rounded-card bg-surface-subtle p-4 text-xs text-ink">{safeMetadata(selected.metadata)}</pre></div></div>}
    </Drawer>
  </div>;
}
