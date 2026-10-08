import { Link } from "react-router-dom";
import {
  CONDITION_LABELS,
  PRODUCT_STATUS_LABELS,
  formatRelative,
  formatVnd,
} from "@remarket/shared";
import type { ProductListItem } from "@remarket/shared";
import { StatusBadge } from "./StatusBadge";
import { HeartIcon, ImageIcon } from "./icons";

/**
 * The mock adapter flags deleted/blocked listings with `is_hidden`; keeping it
 * optional lets plain ProductListItem values stay assignable to this card.
 */
export type ProductCardData = ProductListItem & { is_hidden?: boolean };

export interface ProductCardProps {
  product: ProductCardData;
  /** Forces the unavailable placeholder regardless of the payload flags. */
  placeholder?: boolean;
  onToggleFavorite?: (product: ProductCardData) => void;
  className?: string;
}

export function ProductCard({
  product,
  placeholder = false,
  onToggleFavorite,
  className,
}: ProductCardProps) {
  const unavailable =
    placeholder || product.is_hidden === true || product.is_blocked === true;
  const status = PRODUCT_STATUS_LABELS[product.status];
  const showStatusOverlay = product.status === "RESERVED" || product.status === "SOLD";
  const timeText = formatRelative(product.published_at ?? product.created_at);
  const favoriteLabel = product.is_favorited
    ? `Bỏ lưu ${product.title}`
    : `Lưu ${product.title}`;

  return (
    <article
      className={[
        "group relative flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface transition-shadow hover:shadow-card-hover",
        className ?? "",
      ].join(" ")}
    >
      {unavailable ? (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-surface-subtle px-4 text-center">
          <ImageIcon size={28} className="text-muted" />
          <p className="t-meta text-muted">Tin đăng không còn khả dụng</p>
        </div>
      ) : (
        <Link to={`/products/${product.id}`} className="block">
          <div className="relative aspect-[4/3] overflow-hidden bg-surface-subtle">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-muted">
                <ImageIcon size={28} />
              </span>
            )}
            {showStatusOverlay && (
              <>
                <span aria-hidden="true" className="absolute inset-0 bg-ink/10" />
                <span className="absolute left-2 top-2">
                  <StatusBadge label={status.label} tone={status.tone} size="sm" />
                </span>
              </>
            )}
          </div>
          <div className="px-3 pt-3">
            <h3 className="t-label line-clamp-2 min-h-[40px] text-ink hover:text-brand">
              {product.title}
            </h3>
          </div>
        </Link>
      )}

      {!unavailable && (
        <div className="flex flex-1 flex-col gap-1 px-3 pb-3">
          <p className="t-price-card text-ink">{formatVnd(product.price)}</p>
          <p className="t-meta text-muted">{CONDITION_LABELS[product.condition]}</p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <span className="t-meta truncate text-muted">{product.province_label}</span>
            <span className="t-meta shrink-0 text-muted">{timeText}</span>
          </div>
        </div>
      )}

      {/* Sibling of the card link, never nested inside the <a> (ui-spec 4). */}
      <button
        type="button"
        aria-pressed={product.is_favorited}
        aria-label={favoriteLabel}
        onClick={() => onToggleFavorite?.(product)}
        className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink shadow-pop transition-colors hover:text-danger"
      >
        <HeartIcon className={product.is_favorited ? "fill-current text-danger" : undefined} />
      </button>
    </article>
  );
}
