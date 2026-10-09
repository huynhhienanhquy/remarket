import { useChatThread } from "../hooks/useChatThread";
import { Link } from "react-router-dom";
import { PRODUCT_STATUS_LABELS, formatDate, formatDateTime, formatVnd } from "@remarket/shared";
import { ApiImage, Button, EmptyState, FormField, InlineAlert, StatusBadge, Textarea } from "@/components/common";
import { ListLoading, OfflineNotice, QueryFailure } from "@/components/common/PageFeedback/PageFeedback";

export function ChatThread({ id }: { id: string }) {
  const {
    viewer,
    connected,
    online,
    content,
    setContent,
    fieldError,
    local,
    setLocal,
    newCount,
    setNewCount,
    area,
    nearBottom,
    olderAnchor,
    textarea,
    conversation,
    history,
    serverIds,
    messages,
    send,
    markRead,
    data,
    allowed,
    submit,
  } = useChatThread(id);

  return <section className="flex h-[calc(100dvh-56px)] min-w-0 flex-col overflow-hidden border-line bg-page lg:h-full lg:rounded-card lg:border">
    {conversation.isPending ? <ListLoading /> : conversation.isError ? <QueryFailure error={conversation.error} retry={() => void conversation.refetch()} /> : data && <>
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-line bg-surface p-4"><h1 className="t-h3 truncate">{data.counterparty.name}</h1><Link to={`/users/${data.counterparty.id}`} className="shrink-0 text-brand">Xem hồ sơ</Link></header>
      <div className="border-b border-line bg-surface-subtle p-3">{data.product ? <Link to={`/products/${data.product.id}`} className="flex gap-3">
        {data.product.image_url && <ApiImage src={data.product.image_url} alt="" className="h-12 w-12 rounded-control object-cover" />}<div className="min-w-0"><p className="truncate t-label">{data.product.title}</p><p>{formatVnd(data.product.price)}</p></div><StatusBadge {...PRODUCT_STATUS_LABELS[data.product.status]} />
      </Link> : <p className="text-muted">Tin đăng không còn khả dụng</p>}</div>
      <OfflineNotice online={online} />
      {!connected && online && <InlineAlert tone="warning" title="Đang kết nối lại">Lịch sử vẫn cập nhật qua kết nối dự phòng.</InlineAlert>}
      <div ref={area} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" onScroll={() => { const element = area.current; if (element) { nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; if (nearBottom.current) setNewCount(0); } }}>
        {history.hasNextPage && <Button variant="secondary" loading={history.isFetchingNextPage} onClick={() => { if (area.current) olderAnchor.current = area.current.scrollHeight; void history.fetchNextPage(); }}>Tải tin nhắn cũ</Button>}
        {history.isPending ? <ListLoading /> : history.isError ? <QueryFailure error={history.error} retry={() => void history.refetch()} /> : messages.length === 0 ? <EmptyState title="Bắt đầu cuộc trò chuyện" description="Gửi tin nhắn để trao đổi về món đồ." /> : messages.map((entry, index) => {
          const own = entry.sender_id === viewer?.id;
          const localEntry = local.find((item) => item.message.client_message_id === entry.client_message_id && !serverIds.has(`${entry.sender_id}:${entry.client_message_id}`));
          const previous = messages[index - 1];
          return <div key={entry.id}>{(!previous || formatDate(previous.created_at) !== formatDate(entry.created_at)) && <p className="my-4 text-center t-meta text-muted">{formatDate(entry.created_at)}</p>}
            <article data-received-id={!own ? entry.id : undefined} className={`w-fit max-w-[85%] rounded-card p-3 lg:max-w-[72%] ${own ? "ml-auto bg-brand-soft" : "bg-surface"}`}>
              <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{entry.content}</p><time className="mt-1 block t-meta text-muted" dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
              {own && <p className="t-meta text-muted">{localEntry?.status === "pending" ? "Đang gửi…" : localEntry?.status === "failed" ? "Gửi thất bại" : entry.read_at ? "Đã xem" : "Đã gửi"}</p>}
              {localEntry?.status === "failed" && <div><p className="t-meta text-danger">{localEntry.error}</p>{localEntry.retryable && <Button variant="ghost" disabled={!online || send.isPending || !allowed} onClick={() => { setLocal((entries) => entries.map((item) => item === localEntry ? { ...item, status: "pending" } : item)); send.mutate(entry); }}>Thử lại</Button>}</div>}
            </article>
          </div>;
        })}
      </div>
      {newCount > 0 && <Button variant="secondary" onClick={() => { nearBottom.current = true; if (area.current) area.current.scrollTop = area.current.scrollHeight; setNewCount(0); }}>{newCount} tin nhắn mới</Button>}
      {markRead.isError && <QueryFailure error={markRead.error} />}
      {!allowed && <InlineAlert tone="warning" title={viewer?.email_verified_at ? data.unavailable_reason ?? "Không thể gửi tin nhắn mới cho tin đăng này." : "Xác minh email để nhắn tin"} />}
      <form className="space-y-2 border-t border-line bg-surface p-3 pb-[max(12px,env(safe-area-inset-bottom))]" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <FormField label="Tin nhắn" htmlFor="chat-message" error={fieldError} helper={content.length > 1800 ? `${content.length}/2.000 ký tự` : undefined}><Textarea ref={textarea} id="chat-message" className="min-h-[44px] max-h-40" rows={1} maxLength={2000} value={content} placeholder="Nhập tin nhắn…" disabled={!allowed || !online} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(min-width: 1024px)").matches) { event.preventDefault(); submit(); } }} /></FormField>
        <div className="flex justify-end"><Button type="submit" loading={send.isPending} disabled={!allowed || !online || !content.trim()}>Gửi tin nhắn</Button></div>
      </form>
    </>}
  </section>;
}
