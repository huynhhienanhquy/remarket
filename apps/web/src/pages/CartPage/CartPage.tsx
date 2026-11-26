import { useCart } from "./hooks/useCart";
import { formatVnd } from "@remarket/shared";
import { ListLoading, OfflineNotice, QueryFailure } from "../../components/common/PageFeedback/PageFeedback";
import { AccountEmptyState, AccountPageHeader } from "../../components/AccountPageHeader/AccountPageHeader";
import { Button } from "../../components/common/Button/Button";
import { InlineAlert } from "../../components/common/InlineAlert/InlineAlert";
import { CartSellerCard } from "./sections/CartSellerCard";

export function CartPage() {
  const {
    viewer, online, cart, removeItem, openChat, groups, selectedIds, subtotal, goToCheckout,
    allSelected, availableCount, setProductSelected, setAllSelected,
  } = useCart();
  const canMessage = online && !openChat.isPending && !removeItem.isPending
    && viewer?.status === "ACTIVE" && !!viewer.email_verified_at;

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
      {(cart.data?.total_items ?? 0) > groups.reduce((count, group) => count + group.items.length, 0) && (
        <InlineAlert tone="warning" title="Giỏ hàng có nhiều hơn 50 món">
          Đang hiển thị 50 món đầu tiên. Hãy xóa hoặc đặt hàng các món đang hiển thị để xem những món còn lại.
        </InlineAlert>
      )}
      {removeItem.isError && <QueryFailure error={removeItem.error} />}
      {openChat.isError && <QueryFailure error={openChat.error} />}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-5">
          <label className="rm-account-card flex min-h-touch cursor-pointer items-center gap-2.5 px-4 py-2 text-sm font-semibold text-ink">
            <input
              type="checkbox"
              className="h-[18px] w-[18px] shrink-0 accent-brand"
              checked={allSelected}
              disabled={availableCount === 0 || removeItem.isPending}
              ref={(input) => {
                if (input) input.indeterminate = selectedIds.length > 0 && !allSelected;
              }}
              onChange={(event) => setAllSelected(event.currentTarget.checked)}
            />
            Chọn tất cả
          </label>
          {groups.map((group) => (
            <CartSellerCard
              key={group.seller.id}
              group={group}
              canRemove={online && !removeItem.isPending}
              canChat={canMessage && viewer.id !== group.seller.id}
              openingChatFor={openChat.isPending ? openChat.variables : undefined}
              selectedIds={selectedIds}
              selectionDisabled={removeItem.isPending}
              onSelectionChange={setProductSelected}
              onRemove={removeItem.mutate}
              onChat={openChat.mutate}
            />
          ))}
        </div>

        <div className="rm-account-card sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-section p-5 lg:bottom-0 xl:bottom-auto xl:top-0">
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
              disabled={selectedIds.length === 0 || !online || removeItem.isPending}
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
