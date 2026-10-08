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
import { Button, InlineAlert, Pagination, ProductCardSkeleton, StatusBadge } from "../../components/ui";

type Role = "buyer" | "seller";

interface OrdersPageProps {
  role: Role;
}

export function OrdersPage({ role }: OrdersPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const status = searchParams.get("status") ?? "ALL";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);

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

  if (orders.isPending) {
    return (
      <div className="rm-container py-6 lg:py-8">
        <h1 className="t-h1 text-ink mb-6">{isBuyer ? "Đơn mua" : "Đơn bán"}</h1>
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (orders.isError) {
    return (
      <div className="rm-container py-6 lg:py-8">
        <h1 className="t-h1 text-ink mb-6">{isBuyer ? "Đơn mua" : "Đơn bán"}</h1>
        <InlineAlert
          tone="danger"
          title="Không tải được danh sách đơn hàng"
          action={
            <Button variant="secondary" onClick={() => orders.refetch()}>
              Tải lại
            </Button>
          }
        />
      </div>
    );
  }

  const items = orders.data?.items ?? [];
  const meta = orders.data?.meta;

  return (
    <div className="rm-container py-6 lg:py-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-6">
        <div>
          <h1 className="t-h1 text-ink">{isBuyer ? "Đơn mua" : "Đơn bán"}</h1>
          <p className="mt-1 t-body text-muted">
            {meta?.total ?? 0} đơn hàng
          </p>
        </div>

        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lọc theo trạng thái">
          {(["ALL", "PENDING", "CONFIRMED", "SHIPPING", "DELIVERED", "COMPLETED", "CANCELLED"] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={status === s}
              onClick={() => setStatus(s)}
              className={[
                "rounded-control px-3 py-1.5 t-label transition-colors",
                status === s
                  ? "bg-brand text-white"
                  : "bg-surface text-ink hover:bg-surface-subtle border border-line",
              ].join(" ")}
            >
              {s === "ALL" ? "Tất cả" : ORDER_STATUS_LABELS[s as keyof typeof ORDER_STATUS_LABELS]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <p className="t-body text-muted">Không có đơn hàng nào ở trạng thái này.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((order) => (
              <Link
                key={order.id}
                to={isBuyer ? `/orders/${order.id}` : `/sales/${order.id}`}
                className="block rounded-card border border-line bg-surface p-4 hover:border-brand transition-colors"
              >
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div>
                      <p className="t-body font-semibold text-ink">
                        {isBuyer ? "Đơn mua" : "Đơn bán"} #{order.code.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="t-meta text-muted truncate max-w-[300px]">
                        {isBuyer
                          ? `Người bán: ${order.counterparty.name}`
                          : `Người mua: ${order.counterparty.name}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 lg:flex-row lg:justify-end">
                    <div className="flex items-center gap-2">
                      {order.items.slice(0, 3).map((snap) => (
                        <img
                          key={snap.id}
                          src={snap.image_url ?? undefined}
                          alt=""
                          className="h-10 w-10 rounded-control object-cover border border-line"
                        />
                      ))}
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <p className="t-body text-ink font-semibold">{formatVnd(order.total_amount)}</p>
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
