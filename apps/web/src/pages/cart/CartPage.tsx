import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addVnd, conditionLabel, formatVnd } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { useSession } from "../../app/SessionProvider";
import { ListLoading, OfflineNotice, QueryFailure, useConnectivity } from "../../components/features/PageFeedback";
import { AccountEmptyState, AccountPageHeader } from "../../components/features/AccountPageHeader";
import {
  Button,
  Icon,
  InlineAlert,
  MarketplaceImage,
  StatusBadge,
} from "../../components/ui";

export function CartPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { viewer: _viewer } = useSession();
  const online = useConnectivity();

  const cart = useQuery({
    queryKey: queryKeys.cart,
    queryFn: () => api.cart.get(),
  });

  const removeItem = useMutation({
    mutationFn: (productId: string) => api.cart.remove(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cart }),
  });

  const groups = useMemo(() => cart.data?.groups ?? [], [cart.data?.groups]);

  const selectedIds = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items
          .filter((item) => item.available && !item.unavailable_reason)
          .map((item) => item.product_id),
      ),
    [groups],
  );

  const subtotal = useMemo(() => {
    const prices: string[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        if (item.available && !item.unavailable_reason) {
          prices.push(item.price);
        }
      }
    }
    return addVnd(...prices);
  }, [groups]);

  function goToCheckout() {
    if (selectedIds.length === 0) return;
    const params = new URLSearchParams();
    params.set("items", selectedIds.join(","));
    navigate(`/checkout?${params.toString()}`);
  }

  if (cart.isPending) {
    return (
      <div className="space-y-6">
        <AccountPageHeader title="Giỏ hàng" description="Xem lại những món đồ bạn muốn mua trước khi đặt hàng." />
        <ListLoading />
      </div>
    );
  }

  if (cart.isError) {
    return (
      <div className="space-y-6">
        <AccountPageHeader title="Giỏ hàng" description="Xem lại những món đồ bạn muốn mua trước khi đặt hàng." />
        <InlineAlert
          tone="danger"
          title="Không tải được giỏ hàng"
          action={
            <Button variant="secondary" onClick={() => cart.refetch()}>
              Tải lại
            </Button>
          }
        />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-6">
        <AccountPageHeader title="Giỏ hàng" description="Xem lại những món đồ bạn muốn mua trước khi đặt hàng." />
        <AccountEmptyState icon="cart"
          title="Giỏ hàng trống"
          description="Bạn chưa thêm món đồ nào vào giỏ hàng."
          action={{ label: "Khám phá sản phẩm", to: "/products" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AccountPageHeader title="Giỏ hàng" description="Xem lại những món đồ bạn muốn mua trước khi đặt hàng." />
      <OfflineNotice online={online} />
      {removeItem.isError && <QueryFailure error={removeItem.error} />}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.seller.id} className="rm-account-card overflow-hidden">
          <div className="flex items-center gap-3 border-b border-line p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name="user" /></span>
            <div><p className="mb-1 text-xs text-muted">Người bán</p>
            <h2 className="t-h3 text-ink">
              <Link to={`/users/${group.seller.id}`} className="hover:text-brand">
                {group.seller.name}
              </Link>
            </h2>
            </div>
          </div>

          <div className="divide-y divide-line">
            {group.items.map((item) => (
              <div
                key={item.product_id}
                className="flex flex-wrap gap-3 p-4 sm:gap-4"
              >
                {item.image_url ? (
                  <MarketplaceImage
                    variant="card"
                    src={item.image_url}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-control object-cover"
                  />
                ) : (
                  <div
                    className="h-20 w-20 shrink-0 rounded-control bg-surface-subtle flex items-center justify-center"
                  >
                    <Icon name="image" className="text-muted" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/products/${item.product_id}`}
                    className="block t-body text-ink hover:text-brand"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-2 t-price-card text-brand">{formatVnd(item.price)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="t-meta text-muted">
                      {item.province_label ?? "Chưa cập nhật khu vực"}
                    </span>
                    <span className="t-meta text-muted">·</span>
                    <span className="t-meta text-muted">
                      {conditionLabel(item.condition)}
                    </span>
                  </div>

                  {item.unavailable_reason && (
                    <p className="mt-2 t-meta text-danger">{item.unavailable_reason}</p>
                  )}
                </div>

                <div className="flex w-full items-center justify-end gap-2 border-t border-line pt-2">
                  {(!item.available || item.unavailable_reason) && <StatusBadge label="Không khả dụng" tone="neutral" />}
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => removeItem.mutate(item.product_id)}
                      disabled={!online || removeItem.isPending}
                      aria-label={`Xóa ${item.title} khỏi giỏ hàng`}
                    >
                      <span className="flex items-center gap-2"><Icon name="trash" size={16} />Xóa</span>
                    </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      </div>

      <div
        className={[
          "rm-account-card sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-section p-5 xl:top-[104px]",
        ].join(" ")}
      >
        <div className="max-w-3xl mx-auto space-y-3">
          <h2 className="text-lg font-semibold text-ink">Thông tin đặt hàng</h2>
          <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4 text-sm text-muted">
            <span>Tạm tính ({selectedIds.length} món)</span>
            <span className="text-xl font-bold text-ink">{formatVnd(subtotal)}</span>
          </div>
          <p className="t-meta text-muted">
            Phí giao hàng sẽ được tính khi đặt hàng theo từng người bán.
          </p>
          <Button
            size="lg"
            fullWidth
            variant="primary"
            disabled={selectedIds.length === 0 || !online}
            onClick={goToCheckout}
          >
            {selectedIds.length === 0
              ? "Chọn món đồ để tiếp tục"
              : `Tiến hành đặt hàng (${selectedIds.length})`}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
