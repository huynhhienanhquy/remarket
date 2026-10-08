import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addVnd, formatVnd } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { useSession } from "../../app/SessionProvider";
import {
  Button,
  EmptyState,
  InlineAlert,
  ProductCardSkeleton,
  StatusBadge,
} from "../../components/ui";

export function CartPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { viewer: _viewer } = useSession();

  const cart = useQuery({
    queryKey: queryKeys.cart,
    queryFn: () => api.cart.get(),
  });

  const removeItem = useMutation({
    mutationFn: (productId: string) => api.cart.remove(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cart }),
    onError: (error) => console.error("Remove failed:", error),
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
      <div className="rm-container py-6 lg:py-8">
        <h1 className="t-h1 text-ink mb-6">Giỏ hàng</h1>
        {Array.from({ length: 3 }, (_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (cart.isError) {
    return (
      <div className="rm-container py-6 lg:py-8">
        <h1 className="t-h1 text-ink mb-6">Giỏ hàng</h1>
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
      <div className="rm-container py-6 lg:py-8">
        <h1 className="t-h1 text-ink mb-6">Giỏ hàng</h1>
        <EmptyState
          title="Giỏ hàng trống"
          description="Bạn chưa thêm món đồ nào vào giỏ hàng."
          action={{ label: "Khám phá sản phẩm", to: "/products" }}
        />
      </div>
    );
  }

  return (
    <div className="rm-container py-6 lg:py-8">
      <h1 className="t-h1 text-ink mb-6">Giỏ hàng</h1>

      {groups.map((group) => (
        <section key={group.seller.id} className="mb-8">
          <div className="mb-4">
            <h2 className="t-h3 text-ink">
              <Link to={`/users/${group.seller.id}`} className="hover:text-brand">
                {group.seller.name}
              </Link>
            </h2>
          </div>

          <div className="space-y-3">
            {group.items.map((item) => (
              <div
                key={item.product_id}
                className="flex gap-4 rounded-card border border-line bg-surface p-4"
              >
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-control object-cover"
                  />
                ) : (
                  <div
                    className="h-20 w-20 shrink-0 rounded-control bg-surface-subtle flex items-center justify-center"
                  >
                    <span className="t-meta text-muted">Ảnh</span>
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <Link
                    to={`/products/${item.product_id}`}
                    className="block t-body text-ink hover:text-brand"
                  >
                    {item.title}
                  </Link>
                  <p className="mt-1 t-price-card text-ink">{formatVnd(item.price)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="t-meta text-muted">
                      {item.province_label ?? "Chưa cập nhật khu vực"}
                    </span>
                    <span className="t-meta text-muted">·</span>
                    <span className="t-meta text-muted">
                      {item.condition === "LIKE_NEW"
                        ? "Rất tốt"
                        : item.condition === "GOOD"
                        ? "Tốt"
                        : item.condition === "FAIR"
                        ? "Bình thường"
                        : "Mới"}
                    </span>
                  </div>

                  {item.unavailable_reason && (
                    <p className="mt-2 t-meta text-danger">{item.unavailable_reason}</p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {item.available && !item.unavailable_reason ? (
                    <Button
                      variant="ghost"
                      size="md"
                      onClick={() => removeItem.mutate(item.product_id)}
                      aria-label={`Xóa ${item.title} khỏi giỏ hàng`}
                    >
                      Xóa
                    </Button>
                  ) : (
                    <StatusBadge label="Không khả dụng" tone="neutral" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <div
        className={[
          "sticky bottom-0 z-section bg-surface/95 backdrop-blur border-t border-line p-4 lg:static lg:border-t lg:pt-6",
        ].join(" ")}
      >
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="flex justify-between t-body text-ink">
            <span>Tạm tính ({selectedIds.length} món)</span>
            <span>{formatVnd(subtotal)}</span>
          </div>
          <p className="t-meta text-muted">
            Phí giao hàng sẽ được tính khi đặt hàng theo từng người bán.
          </p>
          <Button
            size="lg"
            fullWidth
            variant="primary"
            disabled={selectedIds.length === 0}
            onClick={goToCheckout}
          >
            {selectedIds.length === 0
              ? "Chọn món đồ để tiếp tục"
              : `Tiến hành đặt hàng ({selectedIds.length})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
