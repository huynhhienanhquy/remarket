import { useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ORDER_STATUS_LABELS, TICKET_TYPES, TICKET_TYPE_LABELS, validateSupportMessage, validateSupportSubject } from "@remarket/shared";
import type { TicketType } from "@remarket/shared";
import { useSession } from "../../contexts/SessionContext";
import { api } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { apiFieldErrors } from "../../helpers/errors";
import { Button, FormField, Input, Select, Textarea, useToast } from "../../components/common";
import { OfflineNotice, QueryFailure } from "../../components/common/PageFeedback/PageFeedback";
import { useConnectivity } from "../../hooks/useConnectivity";

function useOrderOptions(role: "buyer" | "seller", enabled: boolean) {
  return useInfiniteQuery({ queryKey: ["orders", "support-picker", role], initialPageParam: 1,
    queryFn: ({ pageParam }) => api.orders.list({ role, page: pageParam }),
    getNextPageParam: (last) => last.meta.page < last.meta.total_pages ? last.meta.page + 1 : undefined, enabled });
}

export function SupportNewPage() {
  const [params] = useSearchParams();
  const { viewer } = useSession();
  const orderPrefill = params.get("order_id") ?? "";
  const [type, setType] = useState<TicketType>(orderPrefill && viewer?.email_verified_at ? "ORDER_PROBLEM" : "ACCOUNT");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [orderId, setOrderId] = useState(orderPrefill);
  const [fields, setFields] = useState<Record<string, string>>({});
  const online = useConnectivity();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToast();
  const needsOrder = type === "ORDER_PROBLEM";
  const buyer = useOrderOptions("buyer", needsOrder);
  const seller = useOrderOptions("seller", needsOrder);
  const prefill = useQuery({ queryKey: queryKeys.order(orderPrefill), queryFn: () => api.orders.detail(orderPrefill), enabled: needsOrder && Boolean(orderPrefill) });
  const orders = [...new Map([...(buyer.data?.pages.flatMap((entry) => entry.items) ?? []), ...(seller.data?.pages.flatMap((entry) => entry.items) ?? []), ...(prefill.data ? [prefill.data] : [])].map((entry) => [entry.id, entry])).values()];
  const create = useMutation({ mutationFn: () => api.support.create({ type, subject: subject.trim(), message: message.trim(), ...(needsOrder ? { order_id: orderId } : {}) }),
    onSuccess: (ticket) => { client.setQueryData(queryKeys.ticket(ticket.id), ticket); void client.invalidateQueries({ queryKey: ["support"] }); toast.success("Đã gửi yêu cầu hỗ trợ"); navigate(`/support/${ticket.id}`); },
    onError: (error) => setFields(apiFieldErrors(error) ?? {}) });
  return <div className="max-w-[760px] space-y-6 py-6">
    <Link to="/support" className="text-brand">Quay lại trung tâm hỗ trợ</Link><h1 className="t-h1">Tạo yêu cầu hỗ trợ</h1><OfflineNotice online={online} />
    {create.isError && <QueryFailure error={create.error} />}
    <form className="space-y-4 rounded-card border border-line bg-surface p-4 sm:p-6" onSubmit={(event) => {
      event.preventDefault(); if (create.isPending || !online) return;
      const errors: Record<string, string> = {};
      const titleError = validateSupportSubject(subject); if (titleError) errors.subject = titleError;
      const messageError = validateSupportMessage(message); if (messageError) errors.message = messageError;
      if (needsOrder && !orders.some((order) => order.id === orderId)) errors.order_id = "Hãy chọn một đơn hàng của bạn.";
      setFields(errors); if (Object.keys(errors).length === 0) create.mutate();
    }}>
      <FormField label="Loại yêu cầu" htmlFor="support-type" required><Select id="support-type" value={type} disabled={create.isPending} onChange={(event) => { const next = TICKET_TYPES.find((entry) => entry === event.target.value); if (next) setType(next); }}>{TICKET_TYPES.filter((entry) => viewer?.email_verified_at || entry === "ACCOUNT").map((entry) => <option key={entry} value={entry}>{TICKET_TYPE_LABELS[entry]}</option>)}</Select></FormField>
      <FormField label="Tiêu đề" htmlFor="support-subject" required error={fields.subject}><Input id="support-subject" value={subject} maxLength={150} disabled={create.isPending} onChange={(event) => setSubject(event.target.value)} /></FormField>
      {needsOrder && <div className="space-y-3"><FormField label="Đơn hàng liên quan" htmlFor="support-order" required error={fields.order_id}><Select id="support-order" value={orderId} disabled={create.isPending} onChange={(event) => setOrderId(event.target.value)}><option value="">Chọn đơn mua hoặc đơn bán</option>{orders.map((order) => <option key={order.id} value={order.id}>{order.code} · {order.counterparty.name} · {ORDER_STATUS_LABELS[order.status].label}</option>)}</Select></FormField>
        {[buyer, seller].map((query, index) => query.isError && <QueryFailure key={index} error={query.error} retry={() => void query.refetch()} />)}
        {prefill.isError && <QueryFailure error={prefill.error} retry={() => void prefill.refetch()} />}
        {(buyer.isFetching || seller.isFetching) && <p role="status">Đang tải đơn hàng…</p>}
        {(buyer.hasNextPage || seller.hasNextPage) && <Button variant="secondary" disabled={buyer.isFetching || seller.isFetching} onClick={() => { if (buyer.hasNextPage) void buyer.fetchNextPage(); if (seller.hasNextPage) void seller.fetchNextPage(); }}>Tải thêm đơn hàng</Button>}
      </div>}
      <FormField label="Nội dung" htmlFor="support-message" required error={fields.message} helper={`${message.length}/5.000 ký tự`}><Textarea id="support-message" value={message} maxLength={5000} disabled={create.isPending} onChange={(event) => setMessage(event.target.value)} /></FormField>
      <Button type="submit" loading={create.isPending} disabled={!online}>Gửi yêu cầu</Button>
    </form>
  </div>;
}
