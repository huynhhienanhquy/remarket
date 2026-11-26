import { Link } from "react-router-dom";
import { conditionLabel, formatVnd, type CartGroup } from "@remarket/shared";
import { ApiImage } from "../../../components/common/ApiImage/ApiImage";
import { Button } from "../../../components/common/Button/Button";
import { Icon } from "../../../components/common/Icon/Icon";
import { MarketplaceImage } from "../../../components/common/MarketplaceImage/MarketplaceImage";
import { StatusBadge } from "../../../components/common/StatusBadge/StatusBadge";

const ratingFormat = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

interface CartSellerCardProps {
  group: CartGroup;
  canRemove: boolean;
  canChat: boolean;
  openingChatFor?: string;
  selectedIds: readonly string[];
  selectionDisabled: boolean;
  onSelectionChange: (productId: string, selected: boolean) => void;
  onRemove: (productId: string) => void;
  onChat: (productId: string) => void;
}

export function CartSellerCard({
  group, canRemove, canChat, openingChatFor, selectedIds, selectionDisabled, onSelectionChange, onRemove, onChat,
}: CartSellerCardProps) {
  const { seller, items } = group;
  const initials = seller.name.trim().split(/\s+/).slice(-2).map((part) => part.charAt(0).toUpperCase()).join("");

  return (
    <section className="rm-account-card overflow-hidden rounded-none">
      <Link to={`/users/${seller.id}`} className="rm-card-action flex items-center gap-3 border-b border-line px-4 py-3 hover:bg-page focus-visible:-outline-offset-2">
        {seller.avatar_url ? (
          <ApiImage src={seller.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-2xl object-cover" />
        ) : (
          <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand text-sm font-bold text-white">{initials}</span>
        )}
        <div className="min-w-0 flex-1">
          <p className="t-meta text-muted">Người bán</p>
          <h2 className="break-words text-sm font-semibold text-ink">{seller.name}</h2>
          {seller.rating !== null && (
            <p className="flex items-center gap-1 t-meta text-muted">
              <Icon name="star" size={13} className="fill-amber-500 text-amber-500" />
              <span>{ratingFormat.format(seller.rating)}/5</span>
            </p>
          )}
        </div>
        <Icon name="chevron-right" size={16} className="rm-icon-forward shrink-0 text-muted" />
      </Link>

      {items.map((item) => {
        const condition = conditionLabel(item.condition);
        const unavailable = !item.available || Boolean(item.unavailable_reason);
        return (
          <article key={item.product_id} className="[&+&]:border-t [&+&]:border-line">
            <div className="flex items-start gap-3 px-4 py-4 sm:gap-4">
              <div aria-hidden="true" className="relative h-[84px] w-[84px] shrink-0 overflow-hidden rounded-xl border border-line bg-page sm:h-24 sm:w-24">
                {item.image_url ? (
                  <MarketplaceImage variant="card" src={item.image_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="grid h-full place-items-center text-muted"><Icon name="image" size={21} /></span>
                )}
                <span className="absolute left-1 top-1 max-w-[calc(100%-8px)] rounded-md bg-brand px-1.5 py-0.5 text-[10px] font-semibold leading-tight text-white">{condition}</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <Link to={`/products/${item.product_id}`} className="block break-words text-sm font-semibold leading-5 text-ink hover:text-brand">{item.title}</Link>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 t-meta text-muted">
                  <span className="inline-flex min-w-0 items-center gap-1"><Icon name="map-pin" size={13} className="shrink-0" /><span className="break-words">{item.province_label ?? "Chưa cập nhật khu vực"}</span></span>
                  <span className="rounded-full bg-surface-subtle px-2">{condition}</span>
                </div>
                <p className="break-words t-price-card text-brand">{formatVnd(item.price)}</p>
                {unavailable && (
                  <div className="space-y-1">
                    <StatusBadge label="Không khả dụng" tone="neutral" />
                    {item.unavailable_reason && <p className="t-meta text-danger">{item.unavailable_reason}</p>}
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-x-2 border-t border-line bg-page/75 px-4 py-2">
              <Button variant="ghost" className="!px-2 !text-danger enabled:hover:!bg-danger-bg" disabled={!canRemove} onClick={() => onRemove(item.product_id)} aria-label={`Xóa ${item.title} khỏi giỏ hàng`}>
                <span className="flex items-center gap-1.5"><Icon name="trash" size={16} />Xóa</span>
              </Button>
              <label className="flex min-h-touch cursor-pointer items-center gap-2 px-1 text-sm text-ink">
                <input
                  type="checkbox"
                  aria-label={`Chọn ${item.title}`}
                  className="h-[18px] w-[18px] shrink-0 accent-brand"
                  checked={selectedIds.includes(item.product_id)}
                  disabled={unavailable || selectionDisabled}
                  onChange={(event) => onSelectionChange(item.product_id, event.currentTarget.checked)}
                />
                Chọn
              </label>
              <Button variant="secondary" className="!border-line !px-3" disabled={!canChat || unavailable} loading={openingChatFor === item.product_id} onClick={() => onChat(item.product_id)} aria-label={`Nhắn tin về ${item.title}`}>
                <span className="flex items-center gap-1.5"><Icon name="chat" size={16} />Nhắn tin</span>
              </Button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
