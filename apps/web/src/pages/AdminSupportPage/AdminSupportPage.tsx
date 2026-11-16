import type { AdminSupportTicketDetail, AdminSupportTicketItem, TicketStatus, TicketType } from "@remarket/shared";
import { ORDER_STATUS_LABELS, TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, formatDateTime, formatVnd } from "@remarket/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AdminDataTable as DataTable } from "../../components/admin/AdminDataTable/AdminDataTable";
import { AdminPagination } from "../../components/admin/AdminPagination/AdminPagination";
import { AdminHeading } from "../../components/admin/AdminHeading/AdminHeading";
import { AdminMetrics, AdminNotice, AdminPill } from "../../components/admin/AdminSummary/AdminSummary";
import { AdminAdvancedFilters, AdminToolbar, ToolbarField } from "../../components/admin/AdminToolbar/AdminToolbar";
import { QueryErrorAlert } from "../../components/admin/QueryErrorAlert/QueryErrorAlert";
import { RowAction } from "../../components/admin/RowAction/RowAction";
import type { DataTableColumn } from "../../components/common/DataTable/DataTable";
import { Button } from "../../components/common/Button/Button";
import { ConfirmDialog, Dialog } from "../../components/common/Dialog/Dialog";
import { Drawer } from "../../components/common/Drawer/Drawer";
import { EmptyState } from "../../components/common/EmptyState/EmptyState";
import { FormField } from "../../components/common/FormField/FormField";
import { Icon } from "../../components/common/Icon/Icon";
import { Input, Select, Textarea } from "../../components/common/Input/Input";
import { OrderTimeline } from "../../components/common/OrderTimeline/OrderTimeline";
import { SearchInput } from "../../components/common/SearchInput/SearchInput";
import { SectionCard } from "../../components/common/SectionCard/SectionCard";
import { StatusBadge } from "../../components/common/StatusBadge/StatusBadge";
import { useToast } from "../../components/common/Toast/Toast";
import { queryKeys } from "../../config/queryClient";
import { invalidateAdminResources, patchAdminRows } from "../../helpers/adminCache";
import { errorDescription, fieldError } from "../../helpers/adminErrors";
import { useAdminParams } from "../../hooks/useAdminParams";
import { useAdminQueueCounts, useAdminSummary } from "../../hooks/useAdminSummary";
import { api, apiForQuery } from "../../services/api";
import { readEnumParam, readPage } from "../../utils/adminParams";

const STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
const TYPES = ["ACCOUNT", "ORDER_PROBLEM", "PRODUCT", "OTHER"] as const;

export function AdminSupportPage() {
  const { params, apply } = useAdminParams();
  const queryClient = useQueryClient();
  const toast = useToast();
  const openTickets = useAdminQueueCounts()?.open_tickets;
  const { data: summary } = useAdminSummary("support");
  const page = readPage(params);
  const status = readEnumParam(params, "status", STATUSES);
  const type = readEnumParam(params, "type", TYPES);
  const selectedId = params.get("selected");
  const [reply, setReply] = useState("");
  const [decision, setDecision] = useState<"resolve" | "close" | null>(null);
  const [note, setNote] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [deliveryOutcome, setDeliveryOutcome] = useState<"NOT_DELIVERED" | "RETURNED">("NOT_DELIVERED");
  const [paymentResolution, setPaymentResolution] = useState("");
  const keyword = params.get("q") ?? "";
  const [search, setSearch] = useState(keyword);
  useEffect(() => setSearch(keyword), [keyword]);
  const queryInput = useMemo(() => ({ ...(status ? { status: status as TicketStatus } : {}), ...(type ? { type: type as TicketType } : {}), ...(keyword ? { q: keyword } : {}), ...(params.get("assigned_admin_id") ? { assigned_admin_id: params.get("assigned_admin_id")! } : {}), ...(params.get("from") ? { from: params.get("from")! } : {}), ...(params.get("to") ? { to: params.get("to")! } : {}), page }), [status, type, keyword, params, page]);
  const query = useQuery({ queryKey: queryKeys.adminTickets(queryInput), queryFn: ({ signal }) => apiForQuery(signal).admin.tickets(queryInput) });
  const detail = useQuery({ queryKey: queryKeys.adminTicket(selectedId ?? ""), queryFn: ({ signal }) => apiForQuery(signal).admin.ticket(selectedId!), enabled: selectedId !== null });

  function syncTicket(ticket: AdminSupportTicketDetail) {
    queryClient.setQueryData(queryKeys.adminTicket(ticket.id), ticket);
    void invalidateAdminResources(queryClient, "tickets", "audit");
      patchAdminRows(queryClient, "tickets", ticket);
  }

  const replyMutation = useMutation({
    mutationFn: () => { if (!selectedId) throw new Error("Chưa chọn ticket."); return api.admin.replyTicket(selectedId, reply); },
    onSuccess: (ticket) => { syncTicket(ticket); setReply(""); toast.success("Đã gửi phản hồi"); },
    onError: (error) => toast.error("Không thể gửi phản hồi", { description: errorDescription(error) }),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { status?: TicketStatus; assign?: boolean; resolution_note?: string }) => { if (!selectedId) throw new Error("Chưa chọn ticket."); return api.admin.updateTicket(selectedId, input); },
    onSuccess: (ticket) => { syncTicket(ticket); void invalidateAdminResources(queryClient, "dashboard");
      toast.success("Đã cập nhật yêu cầu hỗ trợ"); setDecision(null); setNote(""); },
    onError: (error) => toast.error("Không thể cập nhật yêu cầu", { description: errorDescription(error) }),
  });

  const ticket = detail.data;
  const afterDelivery = ticket?.order?.status === "SHIPPING" || ticket?.order?.status === "DELIVERED";
  const canCancelOrder = Boolean(
    ticket?.type === "ORDER_PROBLEM" &&
    ticket.order &&
    ticket.order.status !== "COMPLETED" &&
    ticket.order.status !== "CANCELLED" &&
    (!afterDelivery || ((ticket.status === "RESOLVED" || ticket.status === "CLOSED") && ticket.resolution_note)),
  );

  const cancelOrderMutation = useMutation({
    mutationFn: async () => {
      if (!ticket?.order) throw new Error("Yêu cầu này không có đơn hàng liên quan.");
      return api.admin.cancelOrder(ticket.order.id, {
        expected_version: ticket.order.version,
        reason: cancelReason,
        ticket_id: ticket.id,
        ...(afterDelivery
          ? { delivery_outcome: deliveryOutcome, payment_resolution: paymentResolution }
          : {}),
      });
    },
    onSuccess: async () => {
      await detail.refetch();
      void invalidateAdminResources(queryClient, "tickets", "audit");
      setCancelOpen(false);
      setCancelReason("");
      setPaymentResolution("");
      toast.success("Đã hủy đơn qua hỗ trợ");
    },
    onError: (error) => toast.error("Không thể hủy đơn", { description: errorDescription(error) }),
  });

  const columns: Array<DataTableColumn<AdminSupportTicketItem>> = [
    { key: "code", header: "Yêu cầu", render: (ticket) => <div><p className="t-label text-ink">{ticket.code}</p><p className="line-clamp-2 t-meta text-muted">{ticket.subject}</p></div> },
    { key: "user", header: "Người gửi", render: (ticket) => ticket.user.name, hideOnMobile: true },
    { key: "type", header: "Loại", render: (ticket) => <span className="text-muted">{TICKET_TYPE_LABELS[ticket.type]}</span>, hideOnMobile: true },
    { key: "status", header: "Trạng thái", render: (ticket) => <AdminPill tone={TICKET_STATUS_LABELS[ticket.status].tone}>{TICKET_STATUS_LABELS[ticket.status].label}</AdminPill> },
    { key: "assigned_admin", header: "Phụ trách", render: (ticket) => ticket.assigned_admin?.name ?? <i className="text-muted">Chưa phân công</i>, hideOnMobile: true },
    { key: "updated_at", header: "Cập nhật", render: (ticket) => <time dateTime={ticket.updated_at} className="text-muted">{formatDateTime(ticket.updated_at)}</time>, hideOnMobile: true },
    { key: "id", header: "Thao tác", render: (ticket) => <RowAction onClick={() => apply({ selected: ticket.id })}>Mở</RowAction> },
  ];

  const footer = ticket && (ticket.status !== "CLOSED" || canCancelOrder) ? <>
    {ticket.status !== "CLOSED" && !ticket.assigned_admin && <Button variant="secondary" onClick={() => updateMutation.mutate({ assign: true })} loading={updateMutation.isPending}>Nhận xử lý</Button>}
    {ticket.status !== "CLOSED" && ticket.allowed_actions.includes("progress") && <Button variant="secondary" onClick={() => updateMutation.mutate({ status: "IN_PROGRESS", assign: true })} loading={updateMutation.isPending}>Bắt đầu xử lý</Button>}
    {ticket.status !== "CLOSED" && ticket.allowed_actions.includes("resolve") && <Button onClick={() => setDecision("resolve")}>Đánh dấu đã giải quyết</Button>}
    {ticket.status !== "CLOSED" && ticket.allowed_actions.includes("close") && <Button variant="danger" onClick={() => setDecision("close")}>Đóng yêu cầu</Button>}
    {canCancelOrder && <Button variant="danger" onClick={() => setCancelOpen(true)}>Hủy đơn</Button>}
  </> : undefined;

  const averageReply = summary?.first_reply_minutes;
  return <div className="admin-stack">
    <AdminHeading title="Hỗ trợ" description="Tiếp nhận ticket, trao đổi trong luồng hỗ trợ và chuyển trạng thái đúng quy trình." />
    <AdminMetrics columns={3} metrics={[
      { label: "Ticket đang mở", value: openTickets, icon: "clock", tone: "warning", badge: !!openTickets && <AdminPill tone="warning">Cần phản hồi</AdminPill>, note: "Yêu cầu mới từ người dùng" },
      { label: "Đã giải quyết hôm nay", value: summary?.resolved_today, icon: "check", badge: !!summary?.resolved_today && <AdminPill tone="brand">Hoàn thành</AdminPill>, note: "Ticket đã có kết luận" },
      { label: "Thời gian phản hồi TB", value: averageReply == null ? undefined : Math.round(averageReply).toLocaleString("vi-VN") + " phút", icon: "clock", tone: "info", badge: averageReply != null && <AdminPill tone={averageReply < 30 ? "info" : "warning"}>{averageReply < 30 ? "Đạt SLA" : "Quá SLA"}</AdminPill>, note: "Mục tiêu phản hồi dưới 30 phút" },
    ]} />
    <div className="admin-panel">
      <AdminToolbar>
        <ToolbarField label="Trạng thái" htmlFor="ticket-status"><Select id="ticket-status" value={status} onChange={(event) => apply({ status: event.target.value || null })}><option value="">Tất cả</option>{STATUSES.map((value) => <option key={value} value={value}>{TICKET_STATUS_LABELS[value].label}</option>)}</Select></ToolbarField>
        <ToolbarField label="Loại yêu cầu" htmlFor="ticket-type"><Select id="ticket-type" value={type} onChange={(event) => apply({ type: event.target.value || null })}><option value="">Tất cả</option>{TYPES.map((value) => <option key={value} value={value}>{TICKET_TYPE_LABELS[value]}</option>)}</Select></ToolbarField>
        <div className="admin-toolbar-search admin-labeled-search admin-quiet-search">
          <span aria-hidden="true">Tìm mã ticket hoặc người gửi</span>
          <SearchInput label="Tìm mã ticket hoặc người gửi" value={search} onValueChange={setSearch} onSubmit={() => apply({ q: search.trim() || null })} placeholder="Nhập TK-xxx hoặc tên khách hàng…" />
        </div>
        <button type="button" className="admin-utility" onClick={() => { setSearch(""); apply({ q: null, status: null, type: null, assigned_admin_id: null, from: null, to: null, page: null }); }}><Icon name="refresh" size={16} />Đặt lại</button>
        <AdminAdvancedFilters fields={["assigned_admin_id", "from", "to"]}>
        <ToolbarField label="Người phụ trách" htmlFor="ticket-assignee"><Input id="ticket-assignee" value={params.get("assigned_admin_id") ?? ""} onChange={(event) => apply({ assigned_admin_id: event.target.value || null })} placeholder="UUID hoặc UNASSIGNED" /></ToolbarField>
        <ToolbarField label="Từ ngày" htmlFor="ticket-from"><Input id="ticket-from" type="date" value={params.get("from") ?? ""} onChange={(event) => apply({ from: event.target.value || null })} /></ToolbarField>
        <ToolbarField label="Đến ngày" htmlFor="ticket-to"><Input id="ticket-to" type="date" value={params.get("to") ?? ""} onChange={(event) => apply({ to: event.target.value || null })} /></ToolbarField></AdminAdvancedFilters>
      </AdminToolbar>
    </div>
    {query.isError ? <QueryErrorAlert error={query.error} onRetry={() => query.refetch()} /> : <SectionCard className="admin-table-panel" bodyClassName="p-0 lg:p-0">
      {!query.isError && <DataTable columns={columns} rows={query.data?.items ?? []} rowKey={(row) => row.id} loading={query.isPending} onRowClick={(row) => apply({ selected: row.id })} empty={<EmptyState title="Không có yêu cầu hỗ trợ" description="Hãy thay đổi bộ lọc hoặc kiểm tra lại sau." />} />}
      {query.data && <AdminPagination meta={query.data.meta} shown={query.data.items.length} showArrows={false} onPageChange={(next) => apply({ page: String(next) })} />}
    </SectionCard>}
    <AdminNotice title="Quy tắc chuẩn hóa phản hồi Ticket (SLA)"
      action={<button className="admin-notice-link" type="button" onClick={() => setGuideOpen(true)}>Xem quy trình CSKH <Icon name="chevron-right" size={16} /></button>}>
      Phản hồi sơ bộ mọi ticket mới trong vòng 30 phút. Khi giải quyết xong khiếu nại, ghi kết luận và chuyển trạng thái sang “Đã giải quyết” để người gửi nhận thông báo.
    </AdminNotice>
    <Dialog open={guideOpen} onClose={() => setGuideOpen(false)} title="Quy trình CSKH">
      <ol className="list-decimal space-y-2 pl-5">
        <li>Mở ticket, xem nội dung và nhận xử lý nếu chưa có người phụ trách.</li>
        <li>Gửi phản hồi sơ bộ trong vòng 30 phút và cập nhật trạng thái “Đang xử lý”.</li>
        <li>Ghi kết luận khi đã có kết quả, rồi chuyển ticket sang “Đã giải quyết”.</li>
      </ol>
    </Dialog>
    <Drawer open={selectedId !== null} onClose={() => apply({ selected: null }, { replace: true })} title={ticket ? `${ticket.code} · ${ticket.subject}` : "Chi tiết hỗ trợ"} widthClassName="max-w-[900px]" footer={footer}>
      {detail.isPending ? <p className="t-body text-muted">Đang tải yêu cầu…</p> : detail.isError ? <QueryErrorAlert error={detail.error} onRetry={() => detail.refetch()} /> : ticket ? <div className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div className="space-y-4"><div className="space-y-3">{ticket.messages.map((message) => <div key={message.id} className={`max-w-[85%] rounded-card p-3 ${message.sender.role === "ADMIN" ? "ml-auto bg-brand-soft" : "bg-surface-subtle"}`}><div className="flex flex-wrap items-center justify-between gap-2"><p className="t-label text-ink">{message.sender.name}</p><span className="t-meta text-muted">{formatDateTime(message.created_at)}</span></div><p className="mt-1 whitespace-pre-wrap t-body text-ink">{message.message}</p></div>)}</div>{ticket.allowed_actions.includes("reply") && <form className="border-t border-line pt-4" onSubmit={(event) => { event.preventDefault(); replyMutation.mutate(); }}><FormField label="Phản hồi" htmlFor="ticket-reply" required error={fieldError(replyMutation.error, "message")}><Textarea id="ticket-reply" value={reply} maxLength={5000} onChange={(event) => setReply(event.target.value)} placeholder="Nhập phản hồi cho người dùng" /></FormField><div className="mt-3 flex justify-end"><Button type="submit" loading={replyMutation.isPending} disabled={reply.trim() === ""}>Gửi phản hồi</Button></div></form>}</div>
        <aside className="space-y-4"><StatusBadge label={TICKET_STATUS_LABELS[ticket.status].label} tone={TICKET_STATUS_LABELS[ticket.status].tone} /><dl className="space-y-3"><div><dt className="t-meta text-muted">Người gửi</dt><dd className="t-body text-ink">{ticket.user.name}</dd></div><div><dt className="t-meta text-muted">Loại</dt><dd className="t-body text-ink">{TICKET_TYPE_LABELS[ticket.type]}</dd></div><div><dt className="t-meta text-muted">Phụ trách</dt><dd className="t-body text-ink">{ticket.assigned_admin?.name ?? "Chưa phân công"}</dd></div><div><dt className="t-meta text-muted">Cập nhật</dt><dd className="t-body text-ink">{formatDateTime(ticket.updated_at)}</dd></div></dl>{ticket.resolution_note && <div className="rounded-card bg-brand-soft p-3"><p className="t-label text-brand">Kết luận</p><p className="mt-1 whitespace-pre-wrap t-body">{ticket.resolution_note}</p></div>}{ticket.order && <div className="rounded-card border border-line p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="t-label text-ink">Đơn {ticket.order.code}</p><p className="t-meta text-muted">{ticket.order.buyer.name} → {ticket.order.seller.name}</p></div><StatusBadge label={ORDER_STATUS_LABELS[ticket.order.status].label} tone={ORDER_STATUS_LABELS[ticket.order.status].tone} size="sm" /></div><ul className="mt-3 space-y-2 border-y border-line py-3">{ticket.order.items.map((item) => <li key={item.product_id} className="flex justify-between gap-2 t-meta"><span className="line-clamp-2 text-ink">{item.title_snapshot}</span><span className="shrink-0 text-muted">{formatVnd(item.price)}</span></li>)}</ul><p className="mt-3 flex justify-between t-label"><span>Tổng giá trị</span><span>{formatVnd(ticket.order.total_amount)}</span></p><OrderTimeline className="mt-4" currentStatus={ticket.order.status} steps={ticket.order.status_history.map((entry) => ({ status: entry.to_status, label: ORDER_STATUS_LABELS[entry.to_status].label, done: true, at: entry.created_at, actor: entry.actor_name, tone: entry.to_status === "CANCELLED" ? "danger" : "brand" }))} />{ticket.order.cancellation_reason && <p className="mt-3 rounded-control bg-danger-bg p-2 t-meta text-danger">Lý do hủy: {ticket.order.cancellation_reason}</p>}{afterDelivery && !canCancelOrder && ticket.order.status !== "CANCELLED" && <p className="mt-3 t-meta text-muted">Cần giải quyết ticket và ghi kết luận trước khi hủy đơn đang/đã giao.</p>}</div>}</aside>
      </div> : null}
    </Drawer>
    {ticket && decision && <ConfirmDialog title={decision === "resolve" ? "Đánh dấu đã giải quyết?" : "Đóng yêu cầu?"} description={decision === "resolve" ? "Kết luận sẽ được hiển thị cho người dùng. Người dùng có thể phản hồi để mở lại trước khi ticket bị đóng." : "Ticket đã đóng là trạng thái cuối và không thể mở lại."} confirmLabel={decision === "resolve" ? "Đã giải quyết" : "Đóng yêu cầu"} tone={decision === "resolve" ? "primary" : "danger"} loading={updateMutation.isPending} onConfirm={() => updateMutation.mutate({ status: decision === "resolve" ? "RESOLVED" : "CLOSED", resolution_note: note })} onCancel={() => { setDecision(null); setNote(""); }} reasonField={{ label: decision === "resolve" ? "Kết luận xử lý" : "Lý do đóng", required: true, value: note, onChange: setNote }} />}
    {ticket?.order && <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} dismissible={!cancelOrderMutation.isPending} title={`Hủy đơn ${ticket.order.code}`} footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancelOrderMutation.isPending}>Giữ đơn</Button><Button variant="danger" onClick={() => cancelOrderMutation.mutate()} loading={cancelOrderMutation.isPending} disabled={cancelReason.trim() === "" || (afterDelivery && paymentResolution.trim() === "")}>Hủy đơn</Button></>}><p className="t-body text-muted">Thao tác này chuyển đơn sang Đã hủy và được ghi nhật ký quản trị. Đây không phải thao tác hoàn tiền.</p><div className="mt-4 space-y-4"><FormField label="Lý do hủy" htmlFor="cancel-order-reason" required error={fieldError(cancelOrderMutation.error, "reason")}><Textarea id="cancel-order-reason" value={cancelReason} maxLength={1000} onChange={(event) => setCancelReason(event.target.value)} placeholder="Nêu kết luận và căn cứ hủy đơn" /></FormField>{afterDelivery && <><FormField label="Kết quả giao hàng" htmlFor="delivery-outcome" required error={fieldError(cancelOrderMutation.error, "delivery_outcome")}><Select id="delivery-outcome" value={deliveryOutcome} onChange={(event) => setDeliveryOutcome(event.target.value as typeof deliveryOutcome)}><option value="NOT_DELIVERED">Chưa giao cho người mua</option><option value="RETURNED">Hàng đã được trả lại</option></Select></FormField><FormField label="Thỏa thuận thanh toán" htmlFor="payment-resolution" required error={fieldError(cancelOrderMutation.error, "payment_resolution")}><Textarea id="payment-resolution" value={paymentResolution} maxLength={1000} onChange={(event) => setPaymentResolution(event.target.value)} placeholder="Ghi nhận thỏa thuận giữa các bên; hệ thống không tự chuyển tiền" /></FormField></>}</div></Dialog>}
  </div>;
}
