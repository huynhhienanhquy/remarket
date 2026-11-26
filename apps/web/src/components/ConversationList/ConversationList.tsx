import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { formatDate } from "@remarket/shared";
import { apiForQuery } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { ApiImage } from "../common/ApiImage/ApiImage";
import { ChatIcon, Icon } from "../common/Icon/Icon";
import { EmptyState } from "../common/EmptyState/EmptyState";
import { Pagination } from "../common/Pagination/Pagination";
import { ListLoading, QueryFailure } from "../common/PageFeedback/PageFeedback";
import { urlPage } from "../../utils/urlPage";
import { useRealtime } from "../../contexts/RealtimeContext";
import { adminChatReturnPath } from "../../utils/chatNavigation";

interface ConversationListProps {
  activeId?: string;
  activeSending: boolean;
  deleteDisabled: boolean;
  onDelete: (id: string) => void;
}

export function ConversationList({ activeId, activeSending, deleteDisabled, onDelete }: ConversationListProps) {
  const [params, setParams] = useSearchParams();
  const page = urlPage(params.get("page"));
  const returnTo = adminChatReturnPath(params.get("return_to"));
  const conversationParams = new URLSearchParams();
  if (page > 1) conversationParams.set("page", String(page));
  if (returnTo) conversationParams.set("return_to", returnTo);
  const conversationSearch = conversationParams.size ? `?${conversationParams}` : "";
  const { connected } = useRealtime();
  const conversations = useQuery({ queryKey: queryKeys.conversations(page), queryFn: ({ signal }) => apiForQuery(signal).chat.conversations(page), refetchInterval: connected ? false : 15000 });
  const totalPages = conversations.data ? Math.max(1, Math.ceil(conversations.data.meta.total / 20)) : undefined;

  useEffect(() => {
    if (totalPages === undefined || page <= totalPages) return;
    const updated = new URLSearchParams(params);
    if (totalPages === 1) updated.delete("page");
    else updated.set("page", String(totalPages));
    setParams(updated, { replace: true });
  }, [page, params, setParams, totalPages]);

  return (
    <div>
      <header className="sticky top-0 z-section border-b border-slate-100 bg-surface px-5 pb-3 pt-4">
        <h2 className="text-lg font-semibold leading-6 tracking-tight">Cuộc trò chuyện</h2>
        <p className="mt-0.5 text-[11px] leading-4 text-slate-500">Tin nhắn với người mua, người bán và hệ thống</p>
      </header>
      <div>
        {conversations.isPending ? (
          <div className="p-4"><ListLoading /></div>
        ) : conversations.isError ? (
          <div className="p-4"><QueryFailure error={conversations.error} retry={() => void conversations.refetch()} /></div>
        ) : conversations.data.items.length === 0 ? (
          <EmptyState icon={<ChatIcon size={28} />} title="Bạn chưa có tin nhắn" description="Mở một tin đăng và chọn Nhắn tin để trao đổi với người bán." action={{ label: "Khám phá sản phẩm", to: "/products" }} />
        ) : <>
          <ul className="divide-y divide-slate-100">
            {conversations.data.items.map((entry) => {
              const active = entry.id === activeId;
              return (
                <li key={entry.id} className="relative">
                  <Link
                    to={`/messages/${entry.id}${conversationSearch}`}
                    aria-current={active ? "page" : undefined}
                    className={`rm-control rm-card-action flex min-h-[76px] items-center gap-3 border-l-2 py-2 pl-3.5 pr-4 focus-visible:outline-offset-[-2px] hover:bg-brand-soft/70 lg:min-h-20 ${active ? "border-brand bg-brand-soft/70" : "border-transparent"}`}
                  >
                    {entry.counterparty.avatar_url ? (
                      <ApiImage src={entry.counterparty.avatar_url} alt="" className="size-10 shrink-0 rounded-full border border-slate-200 object-cover lg:size-11" />
                    ) : (
                      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-100 text-sm font-medium lg:size-11">
                        {entry.counterparty.name.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-sm font-semibold">{entry.counterparty.name}</p>
                        <time className="shrink-0 text-[11px] leading-4 text-slate-500" dateTime={entry.updated_at}>{formatDate(entry.updated_at)}</time>
                      </div>
                      <div className="mt-0.5 flex min-h-[18px] items-center gap-2 pr-9">
                        <p className={`min-w-0 flex-1 truncate text-xs ${entry.unread_count > 0 ? "font-medium text-ink" : "text-slate-500"} ${entry.last_message ? "" : "italic"}`}>
                          {entry.last_message?.content ?? "Chưa có tin nhắn"}
                        </p>
                        {entry.unread_count > 0 && (
                          <span className="min-w-[18px] shrink-0 rounded-full bg-brand px-1 text-center text-[11px] font-semibold leading-[18px] text-white" aria-label={`${entry.unread_count} tin chưa đọc`}>
                            {entry.unread_count}
                          </span>
                        )}
                      </div>
                      <p className={`mt-0.5 truncate pr-9 text-[11px] leading-4 ${active ? "text-brand" : "text-slate-500"}`}>
                        {entry.is_system ? "Tin nhắn hệ thống" : entry.product?.title ?? "Tin đăng không còn khả dụng"}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Xóa cuộc trò chuyện với ${entry.counterparty.name}`}
                    title="Xóa cuộc trò chuyện"
                    className="absolute bottom-1 right-2 grid size-touch place-items-center rounded-control text-danger transition-colors enabled:hover:bg-danger-bg disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={deleteDisabled || (active && activeSending)}
                    onClick={() => onDelete(entry.id)}
                  >
                    <Icon name="trash" size={17} />
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination
            className="border-t border-slate-100 p-3 sm:flex-col"
            page={page}
            totalPages={totalPages ?? 1}
            onPageChange={(next) => {
              const updated = new URLSearchParams(params);
              updated.set("page", String(next));
              setParams(updated);
            }}
          />
        </>}
      </div>
    </div>
  );
}
