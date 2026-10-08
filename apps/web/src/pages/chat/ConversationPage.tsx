import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { PRODUCT_STATUS_LABELS, formatDate, formatDateTime, formatVnd, validateChatMessage } from "@remarket/shared";
import type { Message } from "@remarket/shared";
import { useSession } from "../../app/SessionProvider";
import { useRealtime } from "../../app/RealtimeProvider";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { apiFieldErrors, isApiError } from "../../lib/errors";
import { ApiImage, Button, EmptyState, FormField, InlineAlert, StatusBadge, Textarea } from "../../components/ui";
import { ListLoading, OfflineNotice, QueryFailure, useConnectivity } from "../../components/features/PageFeedback";
import { ConversationList } from "./ConversationList";

type LocalMessage = { message: Message; status: "pending" | "failed" | "sent"; error?: string; retryable?: boolean };

function ChatThread({ id }: { id: string }) {
  const { viewer } = useSession();
  const { socket, connected } = useRealtime();
  const client = useQueryClient();
  const online = useConnectivity();
  const [content, setContent] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const [local, setLocal] = useState<LocalMessage[]>([]);
  const [newCount, setNewCount] = useState(0);
  const area = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const previousCount = useRef(0);
  const olderAnchor = useRef<number | null>(null);
  const readThrough = useRef("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const conversation = useQuery({ queryKey: ["chat", "detail", id], queryFn: () => api.chat.detail(id) });
  const history = useInfiniteQuery({ queryKey: queryKeys.messages(id), initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.chat.messages(id, pageParam),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    refetchInterval: connected ? 30000 : 5000,
  });
  const persisted = history.data?.pages.flatMap((page) => page.items) ?? [];
  const serverIds = new Set(persisted.map((entry) => `${entry.sender_id}:${entry.client_message_id}`));
  const messages = [...persisted, ...local.filter((entry) => !serverIds.has(`${entry.message.sender_id}:${entry.message.client_message_id}`)).map((entry) => entry.message)]
    .filter((entry, index, all) => all.findIndex((other) => other.id === entry.id) === index)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const send = useMutation({ mutationFn: (entry: Message) => api.chat.send(id, { content: entry.content, client_message_id: entry.client_message_id }),
    onSuccess: ({ message }, input) => {
      setLocal((entries) => entries.map((entry) => entry.message.client_message_id === input.client_message_id ? { message, status: "sent" } : entry));
      void client.invalidateQueries({ queryKey: ["chat"] });
    },
    onError: (error, input) => {
      const retryable = !isApiError(error) || error.isNetwork || error.status >= 500 || error.status === 429 || error.code === "RETRY_LATER";
      setLocal((entries) => entries.map((entry) => entry.message.client_message_id === input.client_message_id ? { ...entry, status: "failed", error: isApiError(error) ? error.message : "Gửi thất bại", retryable } : entry));
      setFieldError(apiFieldErrors(error)?.content);
      void conversation.refetch();
    },
  });
  const markRead = useMutation({ mutationFn: (messageId: string) => api.chat.markRead(id, messageId), onSuccess: () => { void client.invalidateQueries({ queryKey: ["chat", "conversations"] }); }, onError: () => { readThrough.current = ""; } });
  const markReadRef = useRef(markRead);
  markReadRef.current = markRead;

  useEffect(() => {
    if (!socket || !connected) return;
    socket.emit("conversation:join", { conversation_id: id }, (ack: { ok: boolean }) => { if (ack.ok) void client.invalidateQueries({ queryKey: queryKeys.messages(id) }); });
    return () => { socket.emit("conversation:leave", { conversation_id: id }); };
  }, [socket, connected, id, client]);

  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    if (olderAnchor.current !== null && !history.isFetchingNextPage) {
      element.scrollTop += element.scrollHeight - olderAnchor.current;
      olderAnchor.current = null;
    } else if (nearBottom.current) {
      element.scrollTop = element.scrollHeight;
      setNewCount(0);
    } else if (messages.length > previousCount.current && !history.isFetchingNextPage) setNewCount((count) => count + messages.length - previousCount.current);
    previousCount.current = messages.length;
  }, [messages.length, history.isFetchingNextPage]);

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const readVisible = () => {
      if (document.visibilityState !== "visible" || !online || markReadRef.current.isPending) return;
      const bounds = element.getBoundingClientRect();
      const visible = [...element.querySelectorAll<HTMLElement>("[data-received-id]")].filter((item) => {
        const rect = item.getBoundingClientRect();
        return rect.top < bounds.bottom && rect.bottom <= bounds.bottom && rect.bottom > bounds.top;
      });
      const lastId = visible.at(-1)?.dataset.receivedId;
      if (lastId && lastId !== readThrough.current) { readThrough.current = lastId; markReadRef.current.mutate(lastId); }
    };
    const frame = requestAnimationFrame(readVisible);
    element.addEventListener("scroll", readVisible);
    document.addEventListener("visibilitychange", readVisible);
    return () => { cancelAnimationFrame(frame); element.removeEventListener("scroll", readVisible); document.removeEventListener("visibilitychange", readVisible); };
  }, [id, messages.length, online]);

  useEffect(() => {
    const element = textarea.current;
    if (element) { element.style.height = "auto"; element.style.height = `${Math.min(element.scrollHeight, 160)}px`; }
  }, [content]);

  const data = conversation.data;
  const allowed = Boolean(viewer?.email_verified_at && data && (data.can_send ?? Boolean(data.product)));
  function submit() {
    if (!allowed || !online || send.isPending || !content.trim()) return;
    const error = validateChatMessage(content); setFieldError(error ?? undefined); if (error) return;
    const entry: Message = { id: crypto.randomUUID(), client_message_id: crypto.randomUUID(), sender_id: viewer!.id, content: content.trim(), created_at: new Date().toISOString(), read_at: null };
    nearBottom.current = true;
    setLocal((entries) => [...entries, { message: entry, status: "pending" }]);
    setContent(""); send.mutate(entry);
  }
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

export function ConversationPage() {
  const { id = "" } = useParams();
  return <div className="grid lg:mx-auto lg:w-full lg:max-w-[1280px] lg:px-6 lg:h-[calc(100dvh-56px)] lg:grid-cols-[320px_1fr] lg:gap-4 lg:py-6">
    <aside className="hidden overflow-y-auto rounded-card border border-line bg-surface lg:block"><ConversationList activeId={id} /></aside>
    <ChatThread key={id} id={id} />
  </div>;
}
