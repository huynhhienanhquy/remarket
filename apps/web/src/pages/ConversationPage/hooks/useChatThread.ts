import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { validateChatMessage } from "@remarket/shared";
import type { Message } from "@remarket/shared";
import { useSession } from "@/contexts/SessionContext";
import { useRealtime } from "@/contexts/RealtimeContext";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { apiFieldErrors, isApiError } from "@/helpers/errors";
import { useConnectivity } from "@/hooks/useConnectivity";

type LocalMessage = { message: Message; status: "pending" | "failed" | "sent"; error?: string; retryable?: boolean };

/**
 * Owns message history, realtime listeners, read tracking and retry IDs; refs stay attached by the view.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useChatThread(id: string) {
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
  const markRead = useMutation({ mutationFn: (messageId: string) => api.chat.markRead(id, messageId), onSuccess: () => {
    void client.invalidateQueries({ queryKey: ["chat", "conversations"] });
    if (viewer) void client.invalidateQueries({ queryKey: queryKeys.chatUnreadCount(viewer.id) });
  }, onError: () => { readThrough.current = ""; } });
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
  return {
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
  };
}
