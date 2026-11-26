import { useChatThread } from "../hooks/useChatThread";
import { Link } from "react-router-dom";
import { PRODUCT_STATUS_LABELS, formatDate, formatDateTime, formatVnd } from "@remarket/shared";
import { ApiImage } from "../../../components/common/ApiImage/ApiImage";
import { Button } from "../../../components/common/Button/Button";
import { EmptyState } from "../../../components/common/EmptyState/EmptyState";
import { FormField } from "../../../components/common/FormField/FormField";
import { Icon, ImageIcon } from "../../../components/common/Icon/Icon";
import { InlineAlert } from "../../../components/common/InlineAlert/InlineAlert";
import { StatusBadge } from "../../../components/common/StatusBadge/StatusBadge";
import { Textarea } from "../../../components/common/Input/Input";
import { ListLoading, OfflineNotice, QueryFailure } from "@/components/common/PageFeedback/PageFeedback";

export function ChatThread({ id, onDelete, deleteDisabled }: { id: string; onDelete?: () => void; deleteDisabled: boolean }) {
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

  return <section aria-label="Nội dung cuộc trò chuyện" className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-slate-50/40">
    {conversation.isPending ? <div className="p-4"><ListLoading /></div> : conversation.isError ? <div className="p-4"><QueryFailure error={conversation.error} retry={() => void conversation.refetch()} /></div> : data && <>
      <header className="flex min-h-[52px] shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-surface px-4 sm:px-5">
        <h1 className="truncate text-base font-semibold tracking-tight">{data.counterparty.name}</h1>
        <div className="flex shrink-0 items-center gap-2">
          {!data.counterparty.is_system && (
            <Link to={data.is_system && viewer?.role === "ADMIN" ? `/admin/users?selected=${data.counterparty.id}` : `/users/${data.counterparty.id}`} className="inline-flex min-h-touch items-center text-xs font-medium text-brand hover:underline">
              Xem hồ sơ
            </Link>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              className="w-touch !px-0 !text-danger hover:!bg-danger-bg"
              aria-label="Xóa cuộc trò chuyện"
              title="Xóa cuộc trò chuyện"
              disabled={deleteDisabled}
              onClick={onDelete}
            >
              <Icon name="trash" size={18} />
            </Button>
          )}
        </div>
      </header>
      <div className="shrink-0 border-b border-slate-100 bg-surface">
        {data.product ? (
          <Link to={`/products/${data.product.id}`} className="rm-control flex items-center gap-3 px-4 py-3 focus-visible:outline-offset-[-2px] hover:bg-slate-50 sm:px-5">
            {data.product.image_url ? (
              <ApiImage src={data.product.image_url} alt="" className="h-12 w-12 shrink-0 rounded-control border border-slate-200 object-cover" />
            ) : (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-control border border-slate-200 bg-slate-50 text-slate-500">
                <ImageIcon />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{data.product.title}</p>
              <p className="text-sm font-medium">{formatVnd(data.product.price)}</p>
            </div>
            <StatusBadge {...PRODUCT_STATUS_LABELS[data.product.status]} size="sm" />
          </Link>
        ) : (
          <p className="px-4 py-3 text-sm text-slate-500 sm:px-5">{data.is_system ? "Kênh nhắn tin chính thức của ReMarket" : "Tin đăng không còn khả dụng"}</p>
        )}
      </div>
      <OfflineNotice online={online} />
      {!connected && online && <InlineAlert tone="warning" title="Đang kết nối lại">Lịch sử vẫn cập nhật qua kết nối dự phòng.</InlineAlert>}
      <div ref={area} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-5" onScroll={() => { const element = area.current; if (element) { nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80; if (nearBottom.current) setNewCount(0); } }}>
        {history.hasNextPage && <Button variant="secondary" loading={history.isFetchingNextPage} onClick={() => { if (area.current) olderAnchor.current = area.current.scrollHeight; void history.fetchNextPage(); }}>Tải tin nhắn cũ</Button>}
        {history.isPending ? <ListLoading /> : history.isError ? <QueryFailure error={history.error} retry={() => void history.refetch()} /> : messages.length === 0 ? <EmptyState title="Bắt đầu cuộc trò chuyện" description={data.is_system ? "Tin nhắn của quản trị viên được hiển thị với tên Hệ thống ReMarket. Người dùng có thể trả lời tại đây." : "Gửi tin nhắn để trao đổi về món đồ."} /> : messages.map((entry, index) => {
          const own = entry.sender_id === viewer?.id;
          const localEntry = local.find((item) => item.message.client_message_id === entry.client_message_id && !serverIds.has(`${entry.sender_id}:${entry.client_message_id}`));
          const previous = messages[index - 1];
          const date = formatDate(entry.created_at);
          return <div key={entry.id}>
            {(!previous || formatDate(previous.created_at) !== date) && (
              <div className="mb-5 flex justify-center">
                <time className="rounded-md border border-slate-200 bg-surface px-2.5 py-0.5 text-xs text-slate-500" dateTime={entry.created_at}>{date}</time>
              </div>
            )}
            <article data-received-id={!own ? entry.id : undefined} className={`flex max-w-[85%] flex-col gap-1 md:max-w-[72%] ${own ? "ml-auto items-end" : "items-start"}`}>
              <div className={`max-w-full rounded-card border px-3.5 py-2.5 text-sm ${own ? "rounded-tr-sm border-brand-soft bg-brand-soft" : "rounded-tl-sm border-slate-200 bg-surface"}`}>
                {(entry.is_system || (own && data.is_system && viewer?.role === "ADMIN")) && <p className="mb-1 text-xs font-semibold text-brand">Hệ thống ReMarket</p>}
                <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{entry.content}</p>
              </div>
              <div className={`flex flex-wrap gap-x-2 px-0.5 text-[11px] leading-4 text-slate-500 ${own ? "justify-end" : ""}`}>
                <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
                {own && <span>{localEntry?.status === "pending" ? "Đang gửi…" : localEntry?.status === "failed" ? "Gửi thất bại" : entry.read_at ? "Đã xem" : "Đã gửi"}</span>}
              </div>
              {localEntry?.status === "failed" && <div><p className="t-meta text-danger">{localEntry.error}</p>{localEntry.retryable && <Button variant="ghost" disabled={!online || send.isPending || !allowed} onClick={() => { setLocal((entries) => entries.map((item) => item === localEntry ? { ...item, status: "pending" } : item)); send.mutate(entry); }}>Thử lại</Button>}</div>}
            </article>
          </div>;
        })}
      </div>
      {newCount > 0 && <Button variant="secondary" onClick={() => { nearBottom.current = true; if (area.current) area.current.scrollTop = area.current.scrollHeight; setNewCount(0); }}>{newCount} tin nhắn mới</Button>}
      {markRead.isError && <QueryFailure error={markRead.error} />}
      {!allowed && <InlineAlert tone="warning" title={viewer?.email_verified_at ? data.unavailable_reason ?? "Không thể gửi tin nhắn mới cho tin đăng này." : "Xác minh email để nhắn tin"} />}
      <form className="shrink-0 space-y-3 border-t border-slate-100 bg-surface px-4 pt-4 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-5" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <FormField
          label="Tin nhắn"
          htmlFor="chat-message"
          className="[&>label]:text-xs [&>label]:uppercase"
          error={fieldError}
          helper={content.length > 1800 ? `${content.length}/2.000 ký tự` : undefined}
        >
          <Textarea
            ref={textarea}
            id="chat-message"
            className={`block !min-h-[80px] max-h-40 !resize-none !rounded-xl !bg-slate-50/60 !py-2.5 placeholder:text-slate-500 md:!text-sm ${fieldError ? "" : "!border-slate-200 hover:!border-brand"}`}
            error={Boolean(fieldError)}
            rows={1}
            maxLength={2000}
            value={content}
            placeholder="Nhập tin nhắn…"
            disabled={!allowed || !online}
            onChange={(event) => setContent(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing && window.matchMedia("(min-width: 1024px)").matches) {
                event.preventDefault();
                submit();
              }
            }}
          />
        </FormField>
        <div className="flex justify-end">
          <Button type="submit" className="!rounded-xl disabled:!opacity-80 md:!min-h-9 md:!py-1.5" disabled={!allowed || !online || !content.trim()}>Gửi tin nhắn</Button>
        </div>
      </form>
    </>}
  </section>;
}
