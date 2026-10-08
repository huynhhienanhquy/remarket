import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PRODUCT_STATUS_LABELS, TICKET_STATUS_LABELS, formatDateTime, formatVnd } from "@remarket/shared";
import type { AdminDashboard, ProductStatus } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import {
  Button,
  DashboardSkeleton,
  InlineAlert,
  Input,
  SectionCard,
} from "../../components/ui";
import {
  AdminHeading,
  AdminToolbar,
  QueryErrorAlert,
  ToolbarField,
  last30Days,
  useAdminParams,
} from "./adminShared";

interface KpiSpec {
  key: "total_users" | "new_users_in_period" | "pending_products" | "completed_orders_in_period" | "completed_order_value_in_period" | "pending_reports" | "unresolved_tickets";
  label: string;
  /** "Tổng hiện tại" vs the selected period — the spec requires saying which. */
  scope: "current" | "period";
}

const KPIS: KpiSpec[] = [
  { key: "total_users", label: "Tổng user", scope: "current" },
  { key: "new_users_in_period", label: "User mới trong kỳ", scope: "period" },
  { key: "pending_products", label: "Tin chờ duyệt", scope: "current" },
  { key: "completed_orders_in_period", label: "Đơn hoàn tất trong kỳ", scope: "period" },
  { key: "completed_order_value_in_period", label: "Giá trị giao dịch hoàn tất trong kỳ", scope: "period" },
  { key: "pending_reports", label: "Báo cáo chờ xử lý", scope: "current" },
  { key: "unresolved_tickets", label: "Yêu cầu hỗ trợ chưa giải quyết", scope: "current" },
];

/** Formats every dashboard figure for the KPI cards (ui-spec 21: numbers only). */
function kpiValues(data: AdminDashboard): Record<KpiSpec["key"], string> {
  return {
    total_users: data.total_users.toLocaleString("vi-VN"),
    new_users_in_period: data.new_users_in_period.toLocaleString("vi-VN"),
    pending_products: data.pending_products.toLocaleString("vi-VN"),
    completed_orders_in_period: data.completed_orders_in_period.toLocaleString("vi-VN"),
    completed_order_value_in_period: formatVnd(data.completed_order_value_in_period),
    pending_reports: data.pending_reports.toLocaleString("vi-VN"),
    unresolved_tickets: data.unresolved_tickets.toLocaleString("vi-VN"),
  };
}

function KpiCard({
  label,
  scope,
  value,
}: {
  label: string;
  scope: KpiSpec["scope"];
  value: string;
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 lg:p-6">
      <p className="t-meta text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 t-meta text-muted">
        {scope === "current" ? "Tổng hiện tại" : "Theo kỳ đã chọn"}
      </p>
    </div>
  );
}

/** UI-21: KPI numbers only — no chart exists in the contract (ui-spec 23.1). */
export function AdminDashboardPage() {
  const { params, apply } = useAdminParams();
  const defaults = useMemo(last30Days, []);

  const fromParam = params.get("from");
  const toParam = params.get("to");
  const from = fromParam ?? defaults.from;
  const to = toParam ?? defaults.to;

  // Both bounds live in the URL so refresh and back/forward restore them.
  useEffect(() => {
    if (fromParam !== null && toParam !== null) return;
    apply({ from: fromParam ?? from, to: toParam ?? to }, { replace: true });
  }, [fromParam, toParam, from, to, apply]);

  const validRange = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;

  const query = useQuery({
    queryKey: queryKeys.adminDashboard(from, to),
    queryFn: () => api.admin.dashboard(from, to),
    enabled: validRange,
  });

  function changeFrom(value: string) {
    apply({ from: value || null, to });
  }
  function changeTo(value: string) {
    apply({ from, to: value || null });
  }
  function resetRange() {
    apply({ from: defaults.from, to: defaults.to });
  }

  return (
    <div>
      <AdminHeading
        title="Tổng quan"
        description="Các chỉ số vận hành chính của ReMarket theo khoảng ngày đã chọn."
      />

      <SectionCard>
        <AdminToolbar>
          <ToolbarField label="Từ ngày" htmlFor="dashboard-from">
            <Input
              id="dashboard-from"
              type="date"
              value={from}
              max={to}
              onChange={(event) => changeFrom(event.target.value)}
              className="sm:w-52"
            />
          </ToolbarField>
          <ToolbarField label="Đến ngày" htmlFor="dashboard-to">
            <Input
              id="dashboard-to"
              type="date"
              value={to}
              min={from}
              onChange={(event) => changeTo(event.target.value)}
              className="sm:w-52"
            />
          </ToolbarField>
          <Button variant="ghost" onClick={resetRange}>
            30 ngày gần nhất
          </Button>
        </AdminToolbar>

        {!validRange ? (
          <InlineAlert tone="warning" title="Khoảng ngày chưa hợp lệ">
            Ngày bắt đầu phải trước hoặc bằng ngày kết thúc theo định dạng YYYY-MM-DD.
          </InlineAlert>
        ) : query.isPending ? (
          <DashboardSkeleton />
        ) : query.isError ? (
          <QueryErrorAlert
            error={query.error}
            onRetry={() => query.refetch()}
            title="Chưa tải được dữ liệu"
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {KPIS.map((kpi) => (
              <KpiCard
                key={kpi.key}
                label={kpi.label}
                scope={kpi.scope}
                value={kpiValues(query.data)[kpi.key]}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {query.data && !query.isError && (
        <SectionCard className="mt-5" title="Sản phẩm theo trạng thái">
          <p className="mb-4 t-meta text-muted">Tổng hiện tại, không bao gồm tin đã xóa. Tin bị hạn chế vẫn được tính theo trạng thái giao dịch.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).map((status) => (
              <Link key={status} to={`/admin/products?status=${status}`} className="rounded-card border border-line p-4 hover:bg-surface-subtle">
                <p className="t-meta text-muted">{PRODUCT_STATUS_LABELS[status].label}</p>
                <p className="mt-2 text-xl font-semibold text-ink">{query.data.products_by_status[status].toLocaleString("vi-VN")}</p>
              </Link>
            ))}
          </div>
          <Link to="/admin/products?status=BLOCKED" className="mt-4 inline-block t-label text-danger hover:underline">Tin bị hạn chế: {query.data.blocked_products.toLocaleString("vi-VN")}</Link>
        </SectionCard>
      )}

      {query.data && !query.isError && (
        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <SectionCard title="Tin chờ duyệt" actions={<Link to="/admin/products" className="t-label text-brand hover:underline">Xem tất cả</Link>} bodyClassName="p-0 lg:p-0">
            {query.data.pending_products_queue.length === 0 ? <p className="p-5 t-body text-muted">Không có tin đang chờ duyệt.</p> : <ul className="divide-y divide-line">{query.data.pending_products_queue.map((product) => <li key={product.id}><Link to={`/admin/products?selected=${encodeURIComponent(product.id)}`} className="flex items-center gap-3 p-4 hover:bg-surface-subtle">{product.image_url ? <img src={product.image_url} alt="" className="h-12 w-16 rounded-control object-cover" /> : <div className="h-12 w-16 rounded-control bg-surface-subtle" />}<div className="min-w-0 flex-1"><p className="truncate t-label text-ink">{product.title}</p><p className="t-meta text-muted">{product.seller.name} · {formatDateTime(product.created_at)}</p></div><span className="shrink-0 t-meta text-accent">{PRODUCT_STATUS_LABELS.PENDING.label}</span></Link></li>)}</ul>}
          </SectionCard>
          <SectionCard title="Yêu cầu hỗ trợ mới" actions={<Link to="/admin/support?status=OPEN" className="t-label text-brand hover:underline">Xem tất cả</Link>} bodyClassName="p-0 lg:p-0">
            {query.data.open_tickets_queue.length === 0 ? <p className="p-5 t-body text-muted">Không có yêu cầu hỗ trợ mới.</p> : <ul className="divide-y divide-line">{query.data.open_tickets_queue.map((ticket) => <li key={ticket.id}><Link to={`/admin/support?selected=${encodeURIComponent(ticket.id)}`} className="flex items-center justify-between gap-3 p-4 hover:bg-surface-subtle"><div className="min-w-0"><p className="truncate t-label text-ink">{ticket.code} · {ticket.subject}</p><p className="t-meta text-muted">{ticket.user.name} · {formatDateTime(ticket.updated_at)}</p></div><span className="shrink-0 t-meta text-accent">{TICKET_STATUS_LABELS.OPEN.label}</span></Link></li>)}</ul>}
          </SectionCard>
        </div>
      )}
    </div>
  );
}
