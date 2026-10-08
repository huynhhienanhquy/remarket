import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, formatDateTime, validateSupportMessage } from "@remarket/shared";
import { useSession } from "../../app/SessionProvider";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { apiFieldErrors } from "../../lib/errors";
import { Button, ConfirmDialog, FormField, InlineAlert, StatusBadge, Textarea, useToast } from "../../components/ui";
import { ListLoading, OfflineNotice, QueryFailure, useConnectivity } from "../../components/features/PageFeedback";

export function SupportTicketPage() {
  const { id = "" } = useParams();
  const { viewer } = useSession();
  const [message, setMessage] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [confirmClose, setConfirmClose] = useState(false);
  const client = useQueryClient();
  const toast = useToast();
  const online = useConnectivity();
  const ticket = useQuery({ queryKey: queryKeys.ticket(id), queryFn: () => api.support.detail(id), refetchInterval: 15000 });
  const relatedOrder = useQuery({ queryKey: queryKeys.order(ticket.data?.order_id ?? ""), queryFn: () => api.orders.detail(ticket.data!.order_id!), enabled: Boolean(ticket.data?.order_id) });
  const change = useMutation({ mutationFn: (action: "reply" | "close") => action === "reply" ? api.support.reply(id, message.trim()) : api.support.close(id),
    onSuccess: (data, action) => { client.setQueryData(queryKeys.ticket(id), data); void client.invalidateQueries({ queryKey: ["support", "list"] }); setMessage(""); setConfirmClose(false); toast.success(action === "close" ? "Đã đóng yêu cầu" : "Đã gửi phản hồi"); },
    onError: (error) => { setConfirmClose(false); setFieldError(apiFieldErrors(error)?.message); void ticket.refetch(); } });
  const data = ticket.data;
  return <div className="max-w-[900px] space-y-6 py-6">
    <Link to="/support" className="text-brand">Quay lại trung tâm hỗ trợ</Link><OfflineNotice online={online} />
    {ticket.isPending ? <ListLoading /> : ticket.isError ? <QueryFailure error={ticket.error} retry={() => void ticket.refetch()} /> : data && <>
      <header className="space-y-2"><p className="t-meta text-muted">{data.code} · {TICKET_TYPE_LABELS[data.type]}</p><h1 className="t-h1 break-words">{data.subject}</h1><StatusBadge {...TICKET_STATUS_LABELS[data.status]} /><p className="t-meta text-muted">Tạo lúc {formatDateTime(data.created_at)}</p></header>
      {relatedOrder.data && <Link to={`/${relatedOrder.data.role === "seller" ? "sales" : "orders"}/${relatedOrder.data.id}`} className="inline-block text-brand">Xem đơn {relatedOrder.data.code}</Link>}
      {relatedOrder.isError && <QueryFailure error={relatedOrder.error} retry={() => void relatedOrder.refetch()} />}
      {data.resolution_note && <InlineAlert tone="info" title="Kết luận hỗ trợ">{data.resolution_note}</InlineAlert>}
      <ol className="space-y-4">{data.messages.map((entry) => <li key={entry.id} className={`max-w-[90%] rounded-card border border-line p-4 ${entry.sender.id === viewer?.id ? "ml-auto bg-brand-soft" : "bg-surface"}`}><p className="text-sm font-semibold">{entry.sender.id === viewer?.id ? "Bạn" : "Hỗ trợ ReMarket"}</p><p className="my-2 whitespace-pre-wrap break-words">{entry.message}</p><time className="t-meta text-muted" dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time></li>)}</ol>
      {change.isError && <QueryFailure error={change.error} />}
      {data.allowed_actions.includes("reply") && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (change.isPending || !online) return; const error = validateSupportMessage(message); setFieldError(error ?? undefined); if (!error) change.mutate("reply"); }}>
        <FormField label="Phản hồi" htmlFor="ticket-reply" error={fieldError} required helper={`${message.length}/5.000 ký tự`}><Textarea id="ticket-reply" value={message} maxLength={5000} disabled={change.isPending} onChange={(event) => setMessage(event.target.value)} /></FormField>
        <Button type="submit" loading={change.isPending} disabled={!online}>{data.status === "RESOLVED" ? "Vẫn cần hỗ trợ" : "Gửi phản hồi"}</Button>
      </form>}
      {data.allowed_actions.includes("close") && <Button variant="secondary" disabled={change.isPending || !online} onClick={() => setConfirmClose(true)}>Đóng yêu cầu</Button>}
      {data.status === "CLOSED" && <InlineAlert tone="info" title="Yêu cầu đã đóng"><Link to="/support/new" className="text-brand">Tạo yêu cầu mới</Link></InlineAlert>}
    </>}
    {confirmClose && <ConfirmDialog title="Đóng yêu cầu hỗ trợ?" description="Bạn xác nhận vấn đề đã được giải quyết." confirmLabel="Đóng yêu cầu" loading={change.isPending} onCancel={() => setConfirmClose(false)} onConfirm={() => { if (online) change.mutate("close"); }} />}
  </div>;
}
