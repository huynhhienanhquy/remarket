import { Link } from "react-router-dom";
import {
  CONDITION_LABELS,
  PRODUCT_STATUS_LABELS,
  formatRelative,
  formatVnd,
} from "@remarket/shared";
import type { ProductListItem } from "@remarket/shared";
import { StatusBadge } from "../StatusBadge/StatusBadge";
import { ChevronRightIcon, HeartIcon, ImageIcon } from "../Icon/Icon";
import { MarketplaceImage } from "../MarketplaceImage/MarketplaceImage";

/**
 * Saved-item responses flag deleted/blocked listings with `is_hidden`; keeping it
 * optional lets plain ProductListItem values stay assignable to this card.
 */
type ProductCardData = ProductListItem & { is_hidden?: boolean };

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

  const face = (
    <div className="rm-card-preview-face flex flex-1 flex-col overflow-hidden rounded-[inherit] border border-line bg-surface shadow-subtle">
      {unavailable ? (
        <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-surface-subtle px-4 text-center">
          <ImageIcon size={28} className="text-muted" />
          <p className="t-meta text-muted">Tin đăng không còn khả dụng</p>
        </div>
      ) : (
        <>
          <div className="rm-card-media relative aspect-[4/3] overflow-hidden bg-surface-subtle">
            {product.image_url ? (
              <MarketplaceImage
                src={product.image_url}
                alt={product.title}
                loading="lazy"
                variant="card"
                width={480}
                height={360}
                className="rm-card-image h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-muted">
                <ImageIcon size={28} />
              </span>
            )}
            {showStatusOverlay && (
              <>
                <span aria-hidden="true" className="absolute inset-0 bg-ink/10" />
                <span className="rm-card-status absolute bottom-2 left-2">
                  <StatusBadge label={status.label} tone={status.tone} size="sm" />
                </span>
              </>
            )}
            <span aria-hidden="true" className="rm-card-open">
              <ChevronRightIcon size={18} />
            </span>
          </div>
          <div className="rm-card-layer px-3 pt-3">
            <h3 className="rm-card-title line-clamp-2 min-h-[40px] break-words text-sm font-semibold leading-5 text-ink">
              {product.title}
            </h3>
          </div>
          <div className="rm-card-copy flex flex-1 flex-col gap-1 px-3 pb-3">
            <p className="t-price-card break-words text-brand">{formatVnd(product.price)}</p>
            <p className="t-meta self-start rounded-full bg-surface-subtle px-2 py-0.5 text-muted">{CONDITION_LABELS[product.condition]}</p>
            <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0 pt-2">
              {product.province_label && <span className="t-meta min-w-0 max-w-full truncate text-muted">{product.province_label}</span>}
              <time dateTime={product.published_at ?? product.created_at} className="t-meta text-muted">{timeText}</time>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <article
      className={[
        "relative isolate flex h-full min-w-0 flex-col focus-within:ring-2 focus-within:ring-focus",
        unavailable ? "" : "rm-card-preview",
        className ?? "",
      ].join(" ")}
    >
      {unavailable ? face : (
        <Link to={`/products/${product.id}`} className="rm-card-link flex min-w-0 flex-1 rounded-[inherit] focus-visible:outline-none" aria-label={product.title}>
          {face}
        </Link>
      )}

      {/* Sibling of the card link, never nested inside the <a> (ui-spec 4). */}
      {onToggleFavorite && <button
        type="button"
        aria-pressed={product.is_favorited}
        aria-label={favoriteLabel}
        onClick={() => onToggleFavorite(product)}
        className="rm-icon-heart absolute right-[9px] top-[9px] z-20 flex h-11 w-11 items-center justify-center rounded-full bg-surface text-ink shadow-pop hover:bg-danger-bg hover:text-danger"
      >
        <HeartIcon className={product.is_favorited ? "rm-icon-favorite fill-current text-danger" : "rm-icon-favorite"} />
      </button>}
    </article>
  );
}
