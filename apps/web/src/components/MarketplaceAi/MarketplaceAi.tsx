import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopilotKitProvider, CopilotPopup, useRenderTool } from "@copilotkit/react-core/v2";
import type { CopilotChatLabels } from "@copilotkit/react-core/v2";
import { aiEndpoints } from "@remarket/api-client";
import { ACCOUNT_STATS_LABELS, ACCOUNT_STATS_TOPICS, CONDITIONS, DELIVERY_METHODS, SORT_OPTIONS, formatDateTime, formatVnd } from "@remarket/shared";
import type { AiAccountStats, AccountStatsTopic, ProductListItem } from "@remarket/shared";
import { z } from "zod";
import { API_BASE_URL } from "../../config/environment";
import { api, http } from "../../services/api";
import { copilotHeaders, lastUserMessage } from "../../services/copilotSession";
import { errorTitle } from "../../helpers/errors";
import { Button } from "../common/Button/Button";
import { ProductCard } from "../common/ProductCard/ProductCard";
import "./marketplace-ai.css";

const ai = aiEndpoints(http);
const AGENT = "marketplace";
const MAX_MESSAGE_LENGTH = 1_200;
const safeToolArgs = z.object({}).passthrough();
const toolResult = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("search"), total: z.number().int().nonnegative(), product_ids: z.array(z.string().uuid()).max(6),
    filters: z.object({
      q: z.string().max(100), category_id: z.string().uuid(), province_code: z.string().max(10),
      condition: z.enum(CONDITIONS), delivery_method: z.enum(DELIVERY_METHODS), sort: z.enum(SORT_OPTIONS),
      min_price: z.string().regex(/^\d{1,12}$/), max_price: z.string().regex(/^\d{1,12}$/),
    }).partial(),
    labels: z.array(z.string()).max(8),
  }),
  z.object({
    kind: z.literal("faq"),
    sources: z.array(z.object({
      id: z.string().regex(/^RM-F\d+$/), title: z.string(),
      href: z.enum(["/support/new", "/products", "/account/products", "/orders", "/verify-email"]),
    })).max(3),
  }),
  z.object({ kind: z.literal("clarify"), message: z.string().max(500) }),
  z.object({
    kind: z.literal("account_stats"),
    period_label: z.string().max(100),
    as_of: z.string().datetime(),
    topics: z.array(z.enum(ACCOUNT_STATS_TOPICS)).min(1).max(ACCOUNT_STATS_TOPICS.length),
    rows: z.array(z.object({
      key: z.custom<keyof typeof ACCOUNT_STATS_LABELS>((value) => typeof value === "string" && Object.hasOwn(ACCOUNT_STATS_LABELS, value)),
      value: z.union([z.number().finite().nonnegative(), z.string().regex(/^\d+$/), z.null()]),
    })).max(Object.keys(ACCOUNT_STATS_LABELS).length),
  }),
]);
type SearchResult = Extract<z.infer<typeof toolResult>, { kind: "search" }>;

const labels: Partial<CopilotChatLabels> = {
  modalHeaderTitle: "Trợ lý ReMarket",
  modalHeaderCloseButtonLabel: "Đóng trợ lý",
  chatInputPlaceholder: "Tìm món đồ hoặc hỏi số liệu tài khoản…",
  chatInputToolbarSendButtonLabel: "Gửi",
  chatInputToolbarStopButtonLabel: "Dừng trả lời",
  chatConnectingLabel: "Đang mở cuộc trò chuyện…",
  chatScrollToBottomLabel: "Đến tin nhắn mới nhất",
  chatDisclaimerText: "Đừng nhập email, số điện thoại hoặc địa chỉ chi tiết.",
};

function SearchCards({ result }: { result: SearchResult }) {
  const client = useQueryClient();
  const ids = result.product_ids;
  const queryKey = ["ai-products", ids];
  const products = useQuery({
    queryKey, queryFn: () => ai.resolveProducts(ids), enabled: ids.length > 0, refetchOnMount: "always",
  });
  const favorite = useMutation({
    mutationFn: ({ id, is_favorited }: ProductListItem) => api.favorites.set(id, !is_favorited),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["products"] });
      void client.invalidateQueries({ queryKey: ["ai-products"] });
    },
  });
  const filters = new URLSearchParams();
  for (const [key, value] of Object.entries(result.filters)) {
    if (value) filters.set(key, value);
  }
  return (
    <section className="space-y-2 rounded-card border border-line bg-surface p-3 text-sm" aria-label="Kết quả tìm sản phẩm">
      <p className="font-semibold">{result.total ? `${result.total} tin phù hợp lúc tìm` : "Chưa có tin phù hợp"}</p>
      {!!result.labels.length && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Bộ lọc đã áp dụng">
          {result.labels.map((label, index) => <li key={index} className="rounded-full bg-surface-subtle px-2 py-1 text-xs">{label}</li>)}
        </ul>
      )}
      {result.total === 0 && <p>Bạn có thể hỏi tiếp để nới một điều kiện, chẳng hạn “Bỏ giới hạn địa điểm”.</p>}
      {products.isFetching && <p role="status">Đang tải tin đăng…</p>}
      {products.isError && <p role="status">Chưa thể tải các thẻ sản phẩm.</p>}
      {!products.isFetching && products.isSuccess && (
        products.data.length > 0
          ? <div className="grid grid-cols-2 gap-2">{products.data.map((product) =>
            <ProductCard key={product.id} product={product} onToggleFavorite={(item) => favorite.mutate(item)} />)}</div>
          : <p>Các tin trong kết quả này đã thay đổi.</p>
      )}
      {favorite.isError && <p role="status">Không thể cập nhật yêu thích. Hãy thử lại.</p>}
      <Link to={filters.size ? `/products?${filters}` : "/products"} className="font-semibold text-brand underline">
        {result.total ? "Xem tất cả" : "Mở bộ lọc tìm kiếm"}
      </Link>
    </section>
  );
}

const accountLinks: Record<AccountStatsTopic, { to: string; label: string }> = {
  sales: { to: "/sales", label: "Đơn bán" },
  purchases: { to: "/orders", label: "Đơn mua" },
  listings: { to: "/account/products", label: "Tin của tôi" },
  favorites: { to: "/favorites", label: "Tin đã lưu" },
  reviews: { to: "/account", label: "Tài khoản" },
  support: { to: "/support", label: "Hỗ trợ" },
};

function AccountNumbers({ result }: { result: AiAccountStats }) {
  return (
    <section className="space-y-2 rounded-card border border-line bg-surface p-3 text-sm" aria-label="Số liệu tài khoản">
      <p className="font-semibold">{result.period_label}</p>
      <p className="text-xs text-muted">Ghi nhận lúc {formatDateTime(result.as_of)}</p>
      <dl className="divide-y divide-line">
        {result.rows.map(({ key, value }) => (
          <div key={key} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt>{ACCOUNT_STATS_LABELS[key]}</dt>
            <dd className="shrink-0 text-right font-semibold tabular-nums">
              {value === null ? "Chưa có" : typeof value === "string" ? formatVnd(value) : value.toLocaleString("vi-VN")}
            </dd>
          </div>
        ))}
      </dl>
      <ul className="flex flex-wrap gap-x-3 gap-y-1">
        {result.topics.map((topic) => <li key={topic}>
          <Link className="text-brand underline" to={accountLinks[topic].to}>{accountLinks[topic].label}</Link>
        </li>)}
      </ul>
    </section>
  );
}

function renderResult(value: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return null; }
  const result = toolResult.safeParse(parsed);
  if (!result.success) return null;
  if (result.data.kind === "search") return <SearchCards result={result.data} />;
  if (result.data.kind === "clarify") return <p className="text-sm">{result.data.message}</p>;
  if (result.data.kind === "account_stats") return <AccountNumbers result={result.data} />;
  if (result.data.sources.length === 0) return <Link to="/support/new" className="text-brand underline">Gửi yêu cầu hỗ trợ</Link>;
  return (
    <ul className="space-y-1 border-l-2 border-brand/30 pl-3 text-sm" aria-label="Nguồn ReMarket">
      {result.data.sources.map((source) => <li key={source.id}><Link to={source.href} className="text-brand underline">{source.title} · {source.id}</Link></li>)}
    </ul>
  );
}

function ToolRenderers() {
  useRenderTool({
    name: "search_products", agentId: AGENT, parameters: safeToolArgs,
    render: (props) => props.status === "complete" ? renderResult(props.result) : <p className="text-sm">Đang tìm tin đăng…</p>,
  });
  useRenderTool({
    name: "lookup_public_faq", agentId: AGENT, parameters: safeToolArgs,
    render: (props) => props.status === "complete" ? renderResult(props.result) : <p className="text-sm">Đang tra hướng dẫn…</p>,
  });
  useRenderTool({
    name: "get_account_stats", agentId: AGENT, parameters: safeToolArgs,
    render: (props) => props.status === "complete" ? renderResult(props.result) : <p className="text-sm">Đang tổng hợp số liệu…</p>,
  });
  return null;
}

function PlainText({ content }: { content: string }) {
  return <p className="whitespace-pre-wrap break-words">{content}</p>;
}

export default function MarketplaceAi({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [problem, setProblem] = useState("");
  const launcher = useRef<HTMLButtonElement>(null);
  const locationKey = useLocation().key;
  useEffect(() => { setOpen(false); }, [locationKey]);
  const client = useQueryClient();
  const key = ["ai-threads", userId];
  const threads = useQuery({ queryKey: key, queryFn: ai.listThreads, enabled: open });
  const threadId = threads.data?.find(({ id }) => id === selectedId)?.id ?? threads.data?.[0]?.id;
  const create = useMutation({
    mutationFn: ai.createThread,
    onSuccess: (thread) => {
      client.setQueryData<Awaited<ReturnType<typeof ai.listThreads>>>(key, (items) => [thread, ...(items ?? [])]);
      setSelectedId(thread.id);
      setProblem("");
    },
    onError: (error) => setProblem(errorTitle(error)),
  });
  const remove = useMutation({
    mutationFn: ai.deleteThread,
    onSuccess: (_data, id) => {
      client.setQueryData<Awaited<ReturnType<typeof ai.listThreads>>>(key, (items) => items?.filter((item) => item.id !== id));
      setSelectedId(undefined);
      setProblem("");
    },
    onError: (error) => setProblem(errorTitle(error)),
  });
  const headers = useCallback(() => copilotHeaders(userId), [userId]);
  function changeOpen(value: boolean) {
    setOpen(value);
    if (!value) launcher.current?.focus();
  }
  const toggle = <button ref={launcher} type="button" onClick={() => changeOpen(!open)} aria-expanded={open}
    className="rm-ai-launcher rounded-full bg-brand px-4 py-3 text-sm font-semibold text-white shadow-pop">
    {open ? "Đóng trợ lý" : "Trợ lý ReMarket"}
  </button>;
  const failure = problem || (threads.isError ? errorTitle(threads.error) : "");
  const errorHelp = failure && (
    <div role="status" className="mt-2 rounded-card bg-surface-subtle p-2 text-sm">
      <p>{failure}</p>
      <Link className="text-brand underline" to="/products">Tìm sản phẩm</Link>
      <span className="px-2">·</span>
      <Link className="text-brand underline" to="/support/new">Gửi yêu cầu hỗ trợ</Link>
    </div>
  );
  if (!threadId) return (
    <>
      {toggle}
      {open && <section aria-label="Trợ lý ReMarket" className="rm-ai-empty rounded-modal border border-line bg-surface p-4 shadow-pop">
        <h2 className="mb-2 font-semibold">Trợ lý ReMarket</h2>
        {threads.isPending ? <p role="status">Đang tải cuộc trò chuyện…</p>
          : threads.isError ? <Button onClick={() => void threads.refetch()}>Thử lại</Button>
            : <Button onClick={() => create.mutate()} disabled={create.isPending}>Bắt đầu trò chuyện</Button>}
        {errorHelp}
      </section>}
    </>
  );
  return (
    <>
      {toggle}
      <div className="rm-marketplace-ai">
        <CopilotKitProvider key={threadId} runtimeUrl={`${API_BASE_URL.replace(/\/$/, "")}/ai/copilotkit`}
          agentId={AGENT} headers={headers} useSingleEndpoint={false} messageFilter={lastUserMessage} enableInspector={false}
          onError={() => setProblem("Chưa thể nhận phản hồi. Hãy thử gửi lại câu hỏi.")}>
          <ToolRenderers />
          <CopilotPopup
            threadId={threadId} open={open} onOpenChange={changeOpen} labels={labels}
            width="min(460px, calc(100vw - 24px))" height="min(650px, calc(100dvh - 145px))"
            clickOutsideToClose={false} messageView={{ assistantMessage: { markdownRenderer: PlainText, toolbarVisible: false } }}
            input={{ textArea: { maxLength: MAX_MESSAGE_LENGTH }, showDisclaimer: true, onFocus: () => setProblem("") }}
            header={{
              children: ({ titleContent, closeButton }) => (
                <header className="border-b border-line bg-surface p-3">
                  <div className="flex items-center justify-between gap-2">{titleContent}{closeButton}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <select aria-label="Cuộc trò chuyện" value={threadId} className="min-w-0 flex-1 rounded border border-line bg-surface p-1"
                      onChange={(event) => { setSelectedId(event.target.value); setProblem(""); }}>
                      {threads.data?.map((thread, index) => <option key={thread.id} value={thread.id}>
                        {new Date(thread.updated_at).toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" })} · Phiên {threads.data!.length - index}
                      </option>)}
                    </select>
                    <button type="button" className="p-1 text-brand" disabled={create.isPending || remove.isPending} onClick={() => create.mutate()}>Phiên mới</button>
                    <button type="button" className="p-1 text-danger" disabled={create.isPending || remove.isPending}
                      onClick={() => { if (window.confirm("Xóa cuộc trò chuyện này?")) remove.mutate(threadId); }}>Xóa phiên</button>
                  </div>
                  {errorHelp}
                </header>
              ),
            }}
          />
        </CopilotKitProvider>
      </div>
    </>
  );
}
