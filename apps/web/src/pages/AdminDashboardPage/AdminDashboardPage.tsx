import { useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PRODUCT_STATUS_LABELS, TICKET_STATUS_LABELS, formatDateTime, formatVnd } from "@remarket/shared";
import type { AdminDashboard, ProductStatus } from "@remarket/shared";
import { apiForQuery } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { Button } from "../../components/common/Button/Button";
import { ApiImage } from "../../components/common/ApiImage/ApiImage";
import { DashboardSkeleton } from "../../components/common/Skeleton/Skeleton";
import { InlineAlert } from "../../components/common/InlineAlert/InlineAlert";
import { Input } from "../../components/common/Input/Input";
import { Icon } from "../../components/common/Icon/Icon";
import { SectionCard } from "../../components/common/SectionCard/SectionCard";
import { AdminPill } from "../../components/admin/AdminSummary/AdminSummary";
import { AdminHeading } from "../../components/admin/AdminHeading/AdminHeading";
import { AdminToolbar, ToolbarField } from "../../components/admin/AdminToolbar/AdminToolbar";
import { QueryErrorAlert } from "../../components/admin/QueryErrorAlert/QueryErrorAlert";
import { last30Days } from "./dateRange";
import { useAdminParams } from "../../hooks/useAdminParams";

interface KpiSpec {
  key: "total_users" | "new_users_in_period" | "pending_products" | "completed_orders_in_period" | "completed_order_value_in_period" | "pending_reports" | "unresolved_tickets";
  label: string;
  /** "Tổng hiện tại" vs the selected period — the spec requires saying which. */
  scope: "current" | "period";
}

const KPIS: KpiSpec[] = [
  { key: "total_users", label: "Tổng người dùng", scope: "current" },
  { key: "new_users_in_period", label: "Người dùng mới trong kỳ", scope: "period" },
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
  metric,
}: {
  label: string;
  scope: KpiSpec["scope"];
  value: string;
  metric: KpiSpec["key"];
}) {
  const highlight = metric === "completed_order_value_in_period";
  const warning = metric === "pending_reports";
  const icons = {
    total_users: "user", new_users_in_period: "users", pending_products: "archive",
    completed_orders_in_period: "cart", completed_order_value_in_period: "store",
    pending_reports: "alert-triangle", unresolved_tickets: "chat",
  } as const;
  const note = warning ? "Cần phản hồi" : metric === "unresolved_tickets" ? "Cần hỗ trợ" : scope === "current" ? "Tổng hiện tại" : "Theo kỳ đã chọn";
  return (
    <div className="admin-panel dashboard-kpi" data-highlight={highlight || undefined}>
      <div className="dashboard-kpi-top">
        <p>{label}</p>
        <span className="admin-metric-icon" data-warning={warning || undefined}><Icon name={icons[metric]} size={18} /></span>
      </div>
      <div className="dashboard-kpi-value"><strong>{value}</strong><small>{highlight ? "Tổng phát sinh hoàn tất" : note}</small></div>
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
    queryFn: ({ signal }) => apiForQuery(signal).admin.dashboard(from, to),
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
    <div className="admin-stack">
      <AdminHeading
        title="Tổng quan"
        description="Các chỉ số vận hành chính của ReMarket theo khoảng ngày đã chọn."
      />

      <SectionCard className="admin-section-flush" bodyClassName="p-0 lg:p-0">
        <AdminToolbar className="dashboard-range">
          <ToolbarField label="Từ ngày" htmlFor="dashboard-from">
            <Input
              id="dashboard-from"
              type="date"
              value={from}
              max={to}
              onChange={(event) => changeFrom(event.target.value)}
              className="sm:w-36"
            />
          </ToolbarField>
          <ToolbarField label="Đến ngày" htmlFor="dashboard-to">
            <Input
              id="dashboard-to"
              type="date"
              value={to}
              min={from}
              onChange={(event) => changeTo(event.target.value)}
              className="sm:w-36"
            />
          </ToolbarField>
          <Button variant="ghost" className="dashboard-range-reset" onClick={resetRange}>
            30 ngày gần nhất
          </Button>
        </AdminToolbar>
      </SectionCard>

      <div>
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
          <div className="dashboard-kpis">
            {KPIS.map((kpi) => (
              <KpiCard
                key={kpi.key}
                metric={kpi.key}
                label={kpi.label}
                scope={kpi.scope}
                value={kpiValues(query.data)[kpi.key]}
              />
            ))}
          </div>
        )}
      </div>

      {query.data && !query.isError && (
        <SectionCard className="dashboard-status">
          <h2>Sản phẩm theo trạng thái</h2>
          <p className="mb-6 mt-1 text-[13px] text-muted">Tổng hiện tại, không bao gồm tin đã xóa. Tin bị hạn chế vẫn được tính theo trạng thái giao dịch.</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(Object.keys(PRODUCT_STATUS_LABELS) as ProductStatus[]).map((status) => (
              <Link key={status} to={`/admin/products?status=${status}`} className="dashboard-status-tile">
                <p className="dashboard-status-label">{PRODUCT_STATUS_LABELS[status].label}</p>
                <p className="dashboard-status-value">{query.data.products_by_status[status].toLocaleString("vi-VN")}</p>
              </Link>
            ))}
          </div>
          <Link to="/admin/products?status=BLOCKED" className="mt-4 block border-t border-line pt-3 text-[13px] text-danger hover:underline">Tin bị hạn chế: {query.data.blocked_products.toLocaleString("vi-VN")}</Link>
        </SectionCard>
      )}

      {query.data && !query.isError && (
        <div className="dashboard-queues">
          <SectionCard className="admin-section-flush" title="Tin chờ duyệt" actions={<Link to="/admin/products" className="t-label text-brand hover:underline">Xem tất cả</Link>} bodyClassName="p-0 lg:p-0">
            {query.data.pending_products_queue.length === 0 ? <p className="p-5 t-body text-muted">Không có tin đang chờ duyệt.</p> : <ul className="divide-y divide-line">{query.data.pending_products_queue.map((product) => <li key={product.id}><Link to={`/admin/products?selected=${encodeURIComponent(product.id)}`} className="flex items-center gap-3.5 px-5 py-4 hover:bg-surface-subtle">{product.image_url ? <ApiImage src={product.image_url} alt="" className="h-12 w-12 shrink-0 rounded-lg border border-line object-cover" /> : <div className="h-12 w-12 shrink-0 rounded-lg bg-brand-soft" />}<div className="min-w-0 flex-1"><p className="truncate t-label text-ink">{product.title}</p><p className="t-meta text-muted">{product.seller.name} · {formatDateTime(product.created_at)}</p></div><AdminPill tone="warning">{PRODUCT_STATUS_LABELS.PENDING.label}</AdminPill></Link></li>)}</ul>}
          </SectionCard>
          <SectionCard className="dashboard-support" title="Yêu cầu hỗ trợ mới" actions={<Link to="/admin/support?status=OPEN" className="t-label text-brand hover:underline">Xem tất cả</Link>} bodyClassName="dashboard-support-body">
            {query.data.open_tickets_queue.length === 0 ? <p className="p-5 t-body text-muted">Không có yêu cầu hỗ trợ mới.</p> : <ul className="space-y-2">{query.data.open_tickets_queue.map((ticket) => <li key={ticket.id}><Link to={`/admin/support?selected=${encodeURIComponent(ticket.id)}`} className="flex items-center gap-3 rounded-xl border border-line bg-page px-4 py-3.5 hover:bg-brand-soft"><span className="admin-avatar admin-avatar-sm"><Icon name="help" size={15} /></span><div className="min-w-0 flex-1"><p className="truncate t-label text-ink">{ticket.code} · {ticket.subject}</p><p className="t-meta text-muted">{ticket.user.name} · {formatDateTime(ticket.updated_at)}</p></div><AdminPill tone="warning">{TICKET_STATUS_LABELS.OPEN.label}</AdminPill></Link></li>)}</ul>}
            <div className="dashboard-sla"><Icon name="clock" size={18} /><p>Mục tiêu SLA là phản hồi yêu cầu hỗ trợ trong vòng 30 phút.</p></div>
          </SectionCard>
        </div>
      )}
    </div>
  );
}
