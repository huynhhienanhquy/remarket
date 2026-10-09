import type { OwnProduct, ProductAction } from "@remarket/shared";
import { Button, ApiImage, Badge } from "@/components/common";
import { PRODUCT_STATUS_LABELS, conditionLabel, formatVnd, formatRelative } from "@remarket/shared";

interface ProductCardProps {
  product: OwnProduct;
  busy: boolean;
  onAction: (action: ProductAction, productId: string) => void;
  onEdit: () => void;
  onView: () => void;
}

export function ProductCard({ product, busy, onAction, onEdit, onView }: ProductCardProps) {
  const showActions = product.allowed_actions.some((action) => action !== "view" && action !== "edit");

  return (
    <div className="rm-account-card flex h-full flex-col overflow-hidden transition-shadow hover:shadow-card-hover">
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-subtle">
        {product.image_url ? (
          <ApiImage src={product.image_url} alt={product.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted">Không có ảnh</div>
        )}
        <div className="absolute top-2 left-2 flex gap-1.5">
          <Badge
            variant={
              product.status === "PENDING" ? "warning" :
              product.status === "ACTIVE" ? "brand" :
              product.status === "REJECTED" ? "danger" :
              product.status === "INACTIVE" ? "neutral" :
              product.status === "RESERVED" ? "info" : "neutral"
            }
          >
            {PRODUCT_STATUS_LABELS[product.status].label}
          </Badge>
          {product.is_blocked && <Badge variant="danger">Bị hạn chế</Badge>}
          {product.is_hidden && <Badge variant="neutral">Đã ẩn</Badge>}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="line-clamp-2 text-base font-semibold leading-6 text-ink">
          {product.title}
        </h3>

        <p className="t-price-card text-brand">{formatVnd(product.price)}</p>
        <p className="t-label text-muted">{conditionLabel(product.condition)}</p>

        <div className="flex flex-wrap items-center gap-2 t-meta text-muted">
          <time dateTime={product.created_at}>{formatRelative(product.created_at)}</time>
          {product.published_at && <time dateTime={product.published_at}>· Đã duyệt: {formatRelative(product.published_at)}</time>}
        </div>

        {product.rejection_reason && (
          <p className="rounded-control bg-danger-bg p-2 text-sm text-danger">
            Lý do từ chối: {product.rejection_reason}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {product.allowed_actions.includes("edit") && <Button variant="secondary" size="md" onClick={onEdit} disabled={busy} className="flex-1">
            Chỉnh sửa
          </Button>}
          {product.allowed_actions.includes("view") && <Button variant="ghost" size="md" onClick={onView} className="flex-1">
            Xem
          </Button>}
          {showActions && (
            <div className="flex flex-wrap gap-1">
              {product.allowed_actions.filter((a) => a !== "edit" && a !== "view").map((action) => (
                <Button
                  key={action}
                  variant={
                    action === "submit" ? "secondary" :
                    action === "hide" ? "ghost" :
                    action === "delete" ? "ghost" : "ghost"
                  }
                  size="md"
                  className={
                    action === "delete" ? "text-danger border-danger" :
                    action === "hide" ? "text-accent" : ""
                  }
                  onClick={() => onAction(action, product.id)}
                  disabled={busy}
                >
                  {action === "submit" || action === "resubmit" ? "Gửi duyệt" : action === "hide" ? "Ẩn" : action === "delete" ? "Xóa" : action}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
