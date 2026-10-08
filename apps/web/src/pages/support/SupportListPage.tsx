import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { TICKET_STATUSES, TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, formatDateTime } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { Icon, Pagination, StatusBadge, buttonClasses } from "../../components/ui";
import { ListLoading, OfflineNotice, QueryFailure, urlPage, useConnectivity } from "../../components/features/PageFeedback";
import { AccountEmptyState, AccountFilters, AccountPageHeader } from "../../components/features/AccountPageHeader";

export function SupportListPage() {
  const [params, setParams] = useSearchParams();
  const status = TICKET_STATUSES.find((entry) => entry === params.get("status"));
  const page = urlPage(params.get("page"));
  const online = useConnectivity();
  const tickets = useQuery({ queryKey: queryKeys.support(status ?? "ALL", page), queryFn: () => api.support.list({ status, page }) });
  return <div className="space-y-6">
    <AccountPageHeader title="Hỗ trợ" description="Gửi yêu cầu và theo dõi phản hồi từ đội ngũ ReMarket." action={<Link to="/support/new" className={buttonClasses("primary", "md")}>Tạo yêu cầu hỗ trợ</Link>} />
    <OfflineNotice online={online} />
    <AccountFilters options={[{ value: "ALL", label: "Tất cả" }, ...TICKET_STATUSES.map((entry) => ({ value: entry, label: TICKET_STATUS_LABELS[entry].label }))]} value={status ?? "ALL"} onChange={(value) => setParams(value === "ALL" ? {} : { status: value })} />
    {tickets.isPending ? <ListLoading /> : tickets.isError ? <QueryFailure error={tickets.error} retry={() => void tickets.refetch()} /> : tickets.data.items.length === 0 ? <AccountEmptyState icon="info" title={status ? "Không có yêu cầu ở trạng thái này" : "Bạn cần hỗ trợ?"} description={status ? "Thử chọn trạng thái khác để tìm yêu cầu của bạn." : "Gửi câu hỏi về tài khoản, tin đăng hoặc đơn hàng. Đội ngũ ReMarket sẽ phản hồi trong yêu cầu của bạn."} action={{ label: "Tạo yêu cầu hỗ trợ", to: "/support/new" }} /> : <>
      <ul className="space-y-3">{tickets.data.items.map((ticket) => <li key={ticket.id}><Link to={`/support/${ticket.id}`} className="rm-account-card block p-5 transition-colors hover:border-brand">
        <div className="flex flex-wrap justify-between gap-3"><div><p className="t-meta text-muted">{ticket.code} · {TICKET_TYPE_LABELS[ticket.type]}</p><h2 className="t-h3 break-words">{ticket.subject}</h2></div><StatusBadge {...TICKET_STATUS_LABELS[ticket.status]} /></div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3"><time className="t-meta text-muted" dateTime={ticket.updated_at}>{formatDateTime(ticket.updated_at)}</time><span className="flex items-center gap-1 text-sm font-medium text-brand">Xem yêu cầu <Icon name="chevron-right" size={16} /></span></div>
        {ticket.order_id && <p className="mt-2 t-meta text-muted">Có đơn hàng liên quan</p>}
      </Link></li>)}</ul>
      <Pagination page={page} total={tickets.data.meta.total} totalPages={Math.max(1, Math.ceil(tickets.data.meta.total / 20))} onPageChange={(next) => setParams({ ...(status ? { status } : {}), page: String(next) })} />
    </>}
  </div>;
}
