import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuditLogItem } from "@remarket/shared";
import { formatDateTime } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { Drawer, EmptyState, Input, Pagination, SectionCard, useToast } from "../../components/ui";
import type { DataTableColumn } from "../../components/ui";
import { AdminDataTable as DataTable, AdminHeading, AdminAdvancedFilters, AdminToolbar, QueryErrorAlert, RowAction, ToolbarField, readPage, useAdminParams } from "./adminShared";

function safeMetadata(metadata: Record<string, unknown>): string {
  return JSON.stringify(metadata, null, 2);
}

export function AdminAuditPage() {
  const { params, apply } = useAdminParams();
  const toast = useToast();
  const page = readPage(params);
  const selectedId = params.get("selected");
  const [action, setAction] = useState(params.get("action") ?? "");
  const [entityType, setEntityType] = useState(params.get("entity_type") ?? "");
  useEffect(() => { setAction(params.get("action") ?? ""); setEntityType(params.get("entity_type") ?? ""); }, [params]);
  const queryInput = useMemo(() => ({ ...(params.get("action") ? { action: params.get("action")! } : {}), ...(params.get("entity_type") ? { entity_type: params.get("entity_type")! } : {}), ...(params.get("entity_id") ? { entity_id: params.get("entity_id")! } : {}), ...(params.get("actor_id") ? { actor_id: params.get("actor_id")! } : {}), ...(params.get("from") ? { from: params.get("from")! } : {}), ...(params.get("to") ? { to: params.get("to")! } : {}), page }), [params, page]);
  const query = useQuery({ queryKey: queryKeys.adminAudit(queryInput), queryFn: () => api.admin.audit(queryInput) });
  const selected = query.data?.items.find((entry) => entry.id === selectedId) ?? null;

  const columns: Array<DataTableColumn<AuditLogItem>> = [
    { key: "created_at", header: "Thời gian", render: (entry) => formatDateTime(entry.created_at) },
    { key: "actor_name", header: "Người thực hiện", render: (entry) => <div><p className="t-body text-ink">{entry.actor_name ?? "Hệ thống"}</p><p className="t-meta text-muted">{entry.actor_type}</p></div> },
    { key: "action", header: "Hành động", render: (entry) => <code className="rounded bg-surface-subtle px-2 py-1 t-meta text-ink">{entry.action}</code> },
    { key: "entity_type", header: "Đối tượng", render: (entry) => <div><p className="t-body text-ink">{entry.entity_type}</p><p className="max-w-[180px] truncate font-mono t-meta text-muted">{entry.entity_id ?? "—"}</p></div>, hideOnMobile: true },
    { key: "reason", header: "Lý do", render: (entry) => <p className="line-clamp-2 max-w-[260px] t-body">{entry.reason ?? "—"}</p>, hideOnMobile: true },
    { key: "id", header: "Chi tiết", render: (entry) => <RowAction onClick={() => apply({ selected: entry.id })}>Xem</RowAction> },
  ];

  function submitFilters() {
    apply({ action: action.trim() || null, entity_type: entityType.trim() || null });
    toast.info("Đã áp dụng bộ lọc nhật ký");
  }

  return <div>
    <AdminHeading title="Nhật ký thao tác" description="Tra cứu lịch sử xử lý và các thay đổi trong khu vực quản trị." />
    <SectionCard bodyClassName="p-0 lg:p-0">
      <form className="p-4 lg:p-6" onSubmit={(event) => { event.preventDefault(); submitFilters(); }}><AdminToolbar>
        <ToolbarField label="Hành động" htmlFor="audit-action" className="sm:min-w-64"><Input id="audit-action" value={action} onChange={(event) => setAction(event.target.value)} placeholder="Ví dụ: product.approve" /></ToolbarField>
        <ToolbarField label="Loại đối tượng" htmlFor="audit-entity" className="sm:min-w-52"><Input id="audit-entity" value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="product, user, report…" /></ToolbarField>
<AdminAdvancedFilters fields={["entity_id", "actor_id", "from", "to"]}>
        <ToolbarField label="Mã đối tượng" htmlFor="audit-entity-id" className="sm:min-w-64"><Input id="audit-entity-id" value={params.get("entity_id") ?? ""} onChange={(event) => apply({ entity_id: event.target.value || null })} placeholder="UUID đối tượng" /></ToolbarField>
        <ToolbarField label="Mã người thực hiện" htmlFor="audit-actor-id" className="sm:min-w-64"><Input id="audit-actor-id" value={params.get("actor_id") ?? ""} onChange={(event) => apply({ actor_id: event.target.value || null })} placeholder="UUID người thực hiện" /></ToolbarField>
        <ToolbarField label="Từ ngày" htmlFor="audit-from"><Input id="audit-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
        <ToolbarField label="Đến ngày" htmlFor="audit-to"><Input id="audit-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField></AdminAdvancedFilters>
        <button type="submit" className="min-h-[44px] rounded-control bg-brand px-4 t-label text-white">Lọc nhật ký</button>
      </AdminToolbar>{query.isError && <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} />}</form>
      {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} loading={query.isPending} onRowClick={(row) => apply({ selected: row.id })} empty={<EmptyState title="Không có nhật ký phù hợp" description="Hãy thay đổi action hoặc loại đối tượng." />} />}
      {query.data && <Pagination className="p-4 lg:px-6" page={query.data.meta.page} totalPages={query.data.meta.total_pages} total={query.data.meta.total} onPageChange={(next) => apply({ page: String(next) })} />}
    </SectionCard>
    <Drawer open={selected !== null} onClose={() => apply({ selected: null }, { replace: true })} title="Chi tiết nhật ký">
      {selected && <div className="space-y-5"><dl className="grid gap-4 sm:grid-cols-2"><div><dt className="t-meta text-muted">Thời gian</dt><dd className="t-body">{formatDateTime(selected.created_at)}</dd></div><div><dt className="t-meta text-muted">Người thực hiện</dt><dd className="t-body">{selected.actor_name ?? "Hệ thống"} ({selected.actor_type})</dd></div><div><dt className="t-meta text-muted">Hành động</dt><dd><code className="t-meta">{selected.action}</code></dd></div><div><dt className="t-meta text-muted">Đối tượng</dt><dd className="t-body">{selected.entity_type}</dd><dd className="break-all font-mono t-meta text-muted">{selected.entity_id ?? "—"}</dd></div></dl><div><p className="t-label text-ink">Lý do</p><p className="mt-1 whitespace-pre-wrap t-body">{selected.reason ?? "Không có lý do riêng."}</p></div><div><p className="t-label text-ink">Metadata đã lọc từ server</p><pre className="mt-2 overflow-x-auto rounded-card bg-surface-subtle p-4 text-xs text-ink">{safeMetadata(selected.metadata)}</pre></div></div>}
    </Drawer>
  </div>;
}
