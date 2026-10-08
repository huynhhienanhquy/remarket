import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { formatDateTime, formatRelative } from "@remarket/shared";
import type { Notification } from "@remarket/shared";
import { useSession } from "../../app/SessionProvider";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { Button, Dialog, Icon, Pagination, useToast } from "../../components/ui";
import { ListLoading, OfflineNotice, QueryFailure, urlPage, useConnectivity } from "../../components/features/PageFeedback";
import { AccountEmptyState, AccountFilters, AccountPageHeader } from "../../components/features/AccountPageHeader";

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const unread = params.get("unread") === "true";
  const page = urlPage(params.get("page"));
  const [selected, setSelected] = useState<Notification | null>(null);
  const { viewer } = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const online = useConnectivity();
  const notifications = useQuery({ queryKey: queryKeys.notifications(unread, page), queryFn: () => api.notifications.list({ unread, page }), refetchInterval: 15000 });
  const reports = useQuery({ queryKey: queryKeys.myReports, queryFn: () => api.reports.mine(), enabled: selected?.reference_type === "report" });
  const read = useMutation({ mutationFn: async (entry: Notification | null) => {
    if (!entry) return api.notifications.markAllRead();
    if (!entry.read_at) await api.notifications.markRead(entry.id);
    // Resolve order role from its authorized DTO; notification content is never a URL.
    if (entry.reference_type === "order" && entry.reference_id) {
      const order = await api.orders.detail(entry.reference_id);
      navigate(`/${order.role === "seller" ? "sales" : "orders"}/${order.id}`);
    } else if (entry.reference_type === "email_verification" && viewer?.role === "ADMIN") navigate("/admin/email-verifications");
    else if (entry.reference_type === "account") navigate("/account");
    else if (entry.reference_type === "product") navigate("/account/products");
    else if ((entry.reference_type === "conversation" || entry.reference_type === "message") && entry.reference_id) navigate(`/messages/${encodeURIComponent(entry.reference_id)}`);
    else if ((entry.reference_type === "ticket" || entry.reference_type === "support") && entry.reference_id) navigate(viewer?.role === "ADMIN" ? "/admin/support" : `/support/${encodeURIComponent(entry.reference_id)}`);
    else setSelected(entry);
    return undefined;
  }, onSuccess: () => { void client.invalidateQueries({ queryKey: ["notifications"] }); }, onError: () => { void client.invalidateQueries({ queryKey: ["notifications"] }); } });
  return <div className="space-y-6">
    <AccountPageHeader title="Thông báo" description="Cập nhật về tin đăng, đơn hàng và hoạt động tài khoản của bạn." action={<Button variant="secondary" disabled={!online || read.isPending || !notifications.data?.meta.unread} loading={read.isPending && read.variables === null} onClick={() => read.mutate(null, { onSuccess: () => toast.success("Đã đánh dấu thông báo đã đọc") })}>Đánh dấu tất cả đã đọc</Button>} />
    <OfflineNotice online={online} />
    <AccountFilters label="Lọc thông báo" options={[{ value: "all", label: "Tất cả" }, { value: "unread", label: "Chưa đọc" }]} value={unread ? "unread" : "all"} onChange={(value) => setParams(value === "unread" ? { unread: "true" } : {})} />
    {read.isError && <QueryFailure error={read.error} />}
    {notifications.isPending ? <ListLoading /> : notifications.isError ? <QueryFailure error={notifications.error} retry={() => void notifications.refetch()} /> : notifications.data.items.length === 0 ? <AccountEmptyState icon={unread ? "check" : "bell"} title={unread ? "Bạn đã đọc hết thông báo" : "Bạn chưa có thông báo"} description={unread ? "Bạn đã cập nhật tất cả thông tin mới. Chọn Tất cả để xem lại thông báo trước đó." : "Thông tin về đơn hàng, tin đăng và tài khoản sẽ xuất hiện tại đây."} /> : <>
      <ul className="space-y-3">{notifications.data.items.map((entry) => <li key={entry.id}><button disabled={read.isPending || !online} className={`rm-account-card flex w-full items-start gap-3 p-4 text-left transition-colors hover:border-brand disabled:opacity-60 sm:gap-4 sm:p-5 ${entry.read_at ? "" : "border-brand/20"}`} onClick={() => read.mutate(entry)}>
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${entry.read_at ? "bg-surface-subtle text-muted" : "bg-brand-soft text-brand"}`}><Icon name="bell" /></span>
        <div className="min-w-0 flex-1"><div className="flex items-start gap-2"><h2 className={`flex-1 break-words text-sm leading-6 ${entry.read_at ? "font-medium" : "font-semibold"}`}>{entry.title}</h2>{!entry.read_at && <span aria-label="Chưa đọc" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />}</div><p className="my-2 line-clamp-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted">{entry.content}</p><time className="t-meta text-muted" dateTime={entry.created_at} title={formatDateTime(entry.created_at)}>{formatRelative(entry.created_at)}</time></div>
      </button></li>)}</ul>
      <Pagination page={page} total={notifications.data.meta.total} totalPages={Math.max(1, Math.ceil(notifications.data.meta.total / 20))} onPageChange={(next) => setParams({ ...(unread ? { unread: "true" } : {}), page: String(next) })} />
    </>}
    <Dialog open={selected !== null} onClose={() => setSelected(null)} title={selected?.title ?? "Thông báo"}><p className="whitespace-pre-wrap break-words">{selected?.content}</p>{selected?.reference_type === "report" && <div className="mt-4">{reports.isPending ? <ListLoading /> : reports.isError ? <QueryFailure error={reports.error} retry={() => void reports.refetch()} /> : <p>{reports.data.items.find((report) => report.id === selected.reference_id)?.resolution_note ?? "Chưa có thêm kết luận."}</p>}</div>}</Dialog>
  </div>;
}
