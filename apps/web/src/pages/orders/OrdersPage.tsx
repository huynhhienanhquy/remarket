import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ORDER_STATUS_LABELS,
  DELIVERY_LABELS,
  formatRelative,
  formatVnd,
} from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { Icon, MarketplaceImage, Pagination, StatusBadge } from "../../components/ui";
import { AccountEmptyState, AccountFilters, AccountPageHeader } from "../../components/features/AccountPageHeader";
import { ListLoading, OfflineNotice, QueryFailure, urlPage, useConnectivity } from "../../components/features/PageFeedback";

type Role = "buyer" | "seller";

interface OrdersPageProps {
  role: Role;
}

export function OrdersPage({ role }: OrdersPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get("status") ?? "ALL";
  const page = urlPage(searchParams.get("page"));
  const online = useConnectivity();

  const orders = useQuery({
    queryKey: queryKeys.orders(role, status, page),
    queryFn: () =>
      api.orders.list({
        role,
        status: status === "ALL" ? undefined : status,
        page,
      }),
    placeholderData: keepPreviousData,
  });

  function setStatus(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next === "ALL") params.delete("status");
    else params.set("status", next);
    params.delete("page");
    setSearchParams(params);
  }

  const isBuyer = role === "buyer";

  const items = orders.data?.items ?? [];
  const meta = orders.data?.meta;

  return (
    <div className="space-y-6">
      <AccountPageHeader title={isBuyer ? "Đơn mua" : "Đơn bán"} description={isBuyer ? "Theo dõi đơn hàng và những món đồ bạn đã mua." : "Quản lý đơn hàng và giao dịch với người mua."} />
      <OfflineNotice online={online} />
      <AccountFilters options={(["ALL", "PENDING", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "CANCELLED"] as const).map((entry) => ({ value: entry, label: entry === "ALL" ? "Tất cả" : ORDER_STATUS_LABELS[entry].label }))} value={status} onChange={setStatus} />
      {orders.isPending ? <ListLoading /> : orders.isError ? <QueryFailure error={orders.error} retry={() => void orders.refetch()} /> : items.length === 0 ? (
        <AccountEmptyState title={status === "ALL" ? (isBuyer ? "Bạn chưa có đơn mua" : "Bạn chưa có đơn bán") : "Không có đơn hàng ở trạng thái này"} description={status === "ALL" ? (isBuyer ? "Khám phá món đồ phù hợp và đặt đơn hàng đầu tiên của bạn." : "Đơn hàng sẽ xuất hiện tại đây khi có người mua món đồ của bạn.") : "Thử chọn một trạng thái khác để xem đơn hàng của bạn."} action={status === "ALL" ? { label: isBuyer ? "Khám phá sản phẩm" : "Xem tin đăng", to: isBuyer ? "/products" : "/account/products" } : undefined} />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((order) => (
              <Link
                key={order.id}
                to={isBuyer ? `/orders/${order.id}` : `/sales/${order.id}`}
                className="rm-account-card block p-5 transition-colors hover:border-brand"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name="inbox" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-ink">
                        {isBuyer ? "Đơn mua" : "Đơn bán"} #{order.code.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="mt-1 truncate text-sm text-muted">
                        {isBuyer
                          ? `Người bán: ${order.counterparty.name}`
                          : `Người mua: ${order.counterparty.name}`}
                      </p>
                    </div>
                    <Icon name="chevron-right" className="shrink-0 text-muted" />
                  </div>

                  <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">
                    <div className="flex items-center gap-2">
                      {order.items.slice(0, 3).map((snap) => (
                        <MarketplaceImage
                          variant="card"
                          key={snap.id}
                          src={snap.image_url ?? ""}
                          alt=""
                          className="h-10 w-10 rounded-control object-cover border border-line"
                        />
                      ))}
                    </div>

                    <div className="flex flex-col gap-1 sm:items-end">
                      <p className="text-lg font-semibold text-brand">{formatVnd(order.total_amount)}</p>
                      <p className="t-meta text-muted">{DELIVERY_LABELS[order.delivery_method]}</p>
                    </div>

                    <StatusBadge
                      label={ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS]?.label ?? order.status}
                      tone={ORDER_STATUS_LABELS[order.status as keyof typeof ORDER_STATUS_LABELS]?.tone ?? "neutral"}
                    />

                    <time dateTime={order.created_at} className="t-meta text-muted">
                      {formatRelative(order.created_at)}
                    </time>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            className="mt-8"
            page={meta?.page ?? 1}
            totalPages={meta?.total_pages ?? 1}
            total={meta?.total}
            onPageChange={(next) => {
              const params = new URLSearchParams(searchParams);
              params.set("page", String(next));
              setSearchParams(params);
            }}
          />
        </>
      )}
    </div>
  );
}
