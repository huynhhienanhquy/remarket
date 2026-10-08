import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OwnProduct, ProductAction } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { useSession } from "../../app/SessionProvider";
import {
  Button,
  ApiImage,
  Badge,
  Pagination,
  ProductCardSkeleton,
  ConfirmDialog,
  useToast,
  buttonClasses,
} from "../../components/ui";
import { PRODUCT_STATUS_LABELS, conditionLabel, formatVnd, formatRelative } from "@remarket/shared";
import { OfflineNotice, QueryFailure, urlPage, useConnectivity } from "../../components/features/PageFeedback";
import { AccountEmptyState, AccountFilters, AccountPageHeader } from "../../components/features/AccountPageHeader";

type StatusFilter = "ALL" | "PENDING" | "ACTIVE" | "REJECTED" | "INACTIVE" | "RESERVED" | "SOLD";
const FILTERS: StatusFilter[] = ["ALL", "PENDING", "ACTIVE", "REJECTED", "INACTIVE", "RESERVED", "SOLD"];

export function MyProductsPage() {
  const navigate = useNavigate();
  const { viewer } = useSession();
  const toast = useToast();
  const client = useQueryClient();
  const online = useConnectivity();
  const refreshProducts = () => { for (const key of ["products", "profiles", "cart", "favorites"]) void client.invalidateQueries({ queryKey: [key] }); };

  const [params, setParams] = useSearchParams();
  const status = FILTERS.find((entry) => entry === params.get("status")) ?? "ALL";
  const page = urlPage(params.get("page"));
  const setPage = (next: number) => { const updated = new URLSearchParams(params); updated.set("page", String(next)); setParams(updated); };
  const [dialog, setDialog] = useState<{ open: boolean; productId: string; action: "delete" | "hide" } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.ownProducts({ status, page }),
    queryFn: () => api.products.mine({ status: status === "ALL" ? undefined : status, page, page_size: 12 } as const),
    enabled: !!viewer,
  });

  const hideMutation = useMutation({
    mutationFn: (productId: string) => api.products.hide(productId),
    onSuccess: () => {
      toast.success("Đã ẩn tin đăng.");
      refreshProducts(); setDialog(null);
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Không thể ẩn tin."),
  });

  const deleteMutation = useMutation({
    mutationFn: (productId: string) => api.products.remove(productId),
    onSuccess: () => {
      toast.success("Đã xóa tin đăng.");
      refreshProducts(); setDialog(null);
      if (data?.items.length === 1 && page > 1) setPage(page - 1);
    },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Không thể xóa tin."),
  });

  const submitMutation = useMutation({
    mutationFn: (productId: string) => api.products.submit(productId),
    onSuccess: () => { toast.success("Đã gửi duyệt lại."); refreshProducts(); },
    onError: (error: unknown) => toast.error(error instanceof Error ? error.message : "Không thể gửi duyệt."),
  });

  const handleAction = (action: ProductAction, productId: string) => {
    if (!online || hideMutation.isPending || deleteMutation.isPending || submitMutation.isPending) return;
    if (action === "hide") {
      setDialog({ open: true, productId, action: "hide" });
    } else if (action === "delete") {
      setDialog({ open: true, productId, action: "delete" });
    } else if (action === "submit" || action === "resubmit") {
      if (!submitMutation.isPending) submitMutation.mutate(productId);
    }
  };

  const confirmDialogAction = () => {
    if (!dialog || !online || hideMutation.isPending || deleteMutation.isPending) return;
    if (dialog.action === "hide") hideMutation.mutate(dialog.productId);
    else if (dialog.action === "delete") deleteMutation.mutate(dialog.productId);
  };

  if (!viewer) return null;

  return (
    <div className="space-y-6">
      <AccountPageHeader title="Tin đăng của tôi" description="Quản lý tin đăng và theo dõi trạng thái món đồ bạn đang bán." action={<Link to="/account/products/new" className={buttonClasses("primary", "md")}>Đăng tin mới</Link>} />
      <OfflineNotice online={online} />
      <AccountFilters options={FILTERS.map((entry) => ({ value: entry, label: entry === "ALL" ? "Tất cả" : PRODUCT_STATUS_LABELS[entry].label }))} value={status} onChange={(value) => setParams(value === "ALL" ? {} : { status: value })} />

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : error ? <QueryFailure error={error} retry={() => void refetch()} /> : !data || data.items.length === 0 ? (
        <AccountEmptyState icon="edit"
          title="Chưa có tin đăng nào"
          description={status === "ALL" ? "Hãy đăng tin đầu tiên của bạn ngay hôm nay." : `Không có tin ở trạng thái “${PRODUCT_STATUS_LABELS[status].label}”.`}
          action={{
            label: "Đăng tin mới",
            onClick: () => navigate("/account/products/new"),
          }}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.items.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                busy={!online || hideMutation.isPending || deleteMutation.isPending || submitMutation.isPending}
                onAction={(action) => handleAction(action, product.id)}
                onEdit={() => navigate(`/account/products/${product.id}/edit`)}
                onView={() => navigate(`/products/${product.id}`)}
              />
            ))}
          </div>

          <Pagination page={page} totalPages={data.meta.total_pages} total={data.meta.total} onPageChange={setPage} />
        </>
      )}

      {dialog && (
        <ConfirmDialog
          open={dialog.open}
          onCancel={() => setDialog(null)}
          onConfirm={confirmDialogAction}
          loading={dialog.action === "hide" ? hideMutation.isPending : deleteMutation.isPending}
          title={dialog.action === "hide" ? "Ẩn tin đăng" : "Xóa tin đăng"}
          description={dialog.action === "hide"
            ? "Tin đăng sẽ không còn hiển thị cho người mua. Bạn có thể hiển thị lại sau."
            : "Tin đăng sẽ ngừng hiển thị. Lịch sử giao dịch vẫn được giữ."}
          confirmLabel={dialog.action === "hide" ? "Ẩn" : "Xóa"}
          tone={dialog.action === "hide" ? "primary" : "danger"}
        />
      )}
    </div>
  );
}

interface ProductCardProps {
  product: OwnProduct;
  busy: boolean;
  onAction: (action: ProductAction, productId: string) => void;
  onEdit: () => void;
  onView: () => void;
}

function ProductCard({ product, busy, onAction, onEdit, onView }: ProductCardProps) {
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
