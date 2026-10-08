import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { TICKET_STATUSES, TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, formatDateTime } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { EmptyState, Pagination, StatusBadge, buttonClasses } from "../../components/ui";
import { ListLoading, QueryFailure, urlPage } from "../../components/features/PageFeedback";

export function SupportListPage() {
  const [params, setParams] = useSearchParams();
  const status = TICKET_STATUSES.find((entry) => entry === params.get("status"));
  const page = urlPage(params.get("page"));
  const tickets = useQuery({ queryKey: queryKeys.support(status ?? "ALL", page), queryFn: () => api.support.list({ status, page }) });
  return <div className="space-y-6 py-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><h1 className="t-h1">Trung tâm hỗ trợ</h1><Link to="/support/new" className={buttonClasses("primary", "md")}>Tạo yêu cầu hỗ trợ</Link></div>
    <div className="flex flex-wrap gap-2" aria-label="Lọc trạng thái">
      {[undefined, ...TICKET_STATUSES].map((entry) => <button key={entry ?? "ALL"} className={`min-h-[44px] rounded-control border px-3 ${entry === status ? "bg-brand text-white" : "bg-surface border-line"}`} aria-pressed={entry === status} onClick={() => setParams(entry ? { status: entry } : {})}>{entry ? TICKET_STATUS_LABELS[entry].label : "Tất cả"}</button>)}
    </div>
    {tickets.isPending ? <ListLoading /> : tickets.isError ? <QueryFailure error={tickets.error} retry={() => void tickets.refetch()} /> : tickets.data.items.length === 0 ? <EmptyState title="Chưa có yêu cầu hỗ trợ" action={{ label: "Tạo yêu cầu hỗ trợ", to: "/support/new" }} /> : <>
      <ul className="space-y-3">{tickets.data.items.map((ticket) => <li key={ticket.id}><Link to={`/support/${ticket.id}`} className="block rounded-card border border-line bg-surface p-4 hover:border-brand">
        <div className="flex flex-wrap justify-between gap-3"><div><p className="t-meta text-muted">{ticket.code} · {TICKET_TYPE_LABELS[ticket.type]}</p><h2 className="t-h3 break-words">{ticket.subject}</h2></div><StatusBadge {...TICKET_STATUS_LABELS[ticket.status]} /></div>
        {ticket.order_id && <p className="mt-2 t-meta text-muted">Có đơn hàng liên quan</p>}<time className="mt-2 block t-meta text-muted" dateTime={ticket.updated_at}>{formatDateTime(ticket.updated_at)}</time>
      </Link></li>)}</ul>
      <Pagination page={page} total={tickets.data.meta.total} totalPages={Math.max(1, Math.ceil(tickets.data.meta.total / 20))} onPageChange={(next) => setParams({ ...(status ? { status } : {}), page: String(next) })} />
    </>}
  </div>;
}
