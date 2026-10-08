import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { formatRelative } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { ApiImage, ChatIcon, EmptyState, Pagination } from "../../components/ui";
import { ListLoading, QueryFailure, urlPage } from "../../components/features/PageFeedback";

export function ConversationList({ activeId }: { activeId?: string }) {
  const [params, setParams] = useSearchParams();
  const page = urlPage(params.get("page"));
  const conversations = useQuery({ queryKey: queryKeys.conversations(page), queryFn: () => api.chat.conversations(page), refetchInterval: 15000 });
  return <div className="space-y-4">
    <div className="border-b border-line p-4"><h2 className="text-base font-semibold text-ink">Cuộc trò chuyện</h2><p className="mt-1 text-xs text-muted">Tin nhắn với người mua và người bán</p></div>
    {conversations.isPending ? <ListLoading /> : conversations.isError ? <QueryFailure error={conversations.error} retry={() => void conversations.refetch()} /> : conversations.data.items.length === 0 ? <EmptyState className="rm-account-empty" icon={<ChatIcon size={28} />} title="Bạn chưa có tin nhắn" description="Mở một tin đăng và chọn Nhắn tin để trao đổi với người bán." action={{ label: "Khám phá sản phẩm", to: "/products" }} /> : <>
      <ul>{conversations.data.items.map((entry) => <li key={entry.id}><Link to={`/messages/${entry.id}`} aria-current={entry.id === activeId ? "page" : undefined} className={`flex min-h-[88px] gap-3 border-b border-line p-4 hover:bg-brand-soft ${entry.id === activeId ? "bg-brand-soft" : "bg-surface"}`}>
        {entry.counterparty.avatar_url ? <ApiImage src={entry.counterparty.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-surface-subtle">{entry.counterparty.name.slice(0, 1)}</span>}
        <div className="min-w-0 flex-1"><div className="flex flex-wrap gap-x-2 gap-y-1"><p className="min-w-0 flex-1 truncate text-sm font-semibold">{entry.counterparty.name}</p><time className="shrink-0 t-meta text-muted" dateTime={entry.updated_at}>{formatRelative(entry.updated_at)}</time></div><p className={`mt-1 truncate text-sm ${entry.unread_count > 0 ? "font-medium text-ink" : "text-muted"}`}>{entry.last_message?.content ?? "Chưa có tin nhắn"}</p><p className="mt-2 truncate t-meta text-muted">{entry.product?.title ?? "Tin đăng không còn khả dụng"}</p></div>
        {entry.unread_count > 0 && <span className="self-center rounded-full bg-brand px-2 text-xs text-white" aria-label={`${entry.unread_count} tin chưa đọc`}>{entry.unread_count}</span>}
      </Link></li>)}</ul>
      <Pagination page={page} totalPages={Math.max(1, Math.ceil(conversations.data.meta.total / 20))} onPageChange={(next) => setParams({ page: String(next) })} />
    </>}
  </div>;
}
