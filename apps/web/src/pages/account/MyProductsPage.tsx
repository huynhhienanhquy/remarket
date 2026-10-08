import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { OwnProduct, ProductAction } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { useSession } from "../../app/SessionProvider";
import {
  Button,
  Badge,
  InlineAlert,
  ProductCardSkeleton,
  EmptyState,
  ConfirmDialog,
  useToast,
} from "../../components/ui";
import { conditionLabel, formatVnd, formatRelative } from "@remarket/shared";
import { OfflineNotice, useConnectivity } from "../../components/features/PageFeedback";

type StatusFilter = "ALL" | "PENDING" | "ACTIVE" | "REJECTED" | "INACTIVE" | "RESERVED" | "SOLD";

export function MyProductsPage() {
  const navigate = useNavigate();
  const { viewer } = useSession();
  const toast = useToast();
  const client = useQueryClient();
  const online = useConnectivity();
  const refreshProducts = () => { for (const key of ["products", "profiles", "cart", "favorites"]) void client.invalidateQueries({ queryKey: [key] }); };

  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<{ open: boolean; productId: string; action: "delete" | "hide" } | null>(null);

  useEffect(() => setPage(1), [status]);

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
      <OfflineNotice online={online} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tin đăng của tôi</h1>
        <Button onClick={() => navigate("/account/products/new")} className="min-w-[140px]">
          Đăng tin mới
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-2">
        {(["ALL", "PENDING", "ACTIVE", "REJECTED", "INACTIVE", "RESERVED", "SOLD"] as StatusFilter[]).map((s) => (
          <Button
            key={s}
            variant={status === s ? "primary" : "ghost"}
            size="md"
            onClick={() => setStatus(s)}
          >
            {s === "ALL" ? "Tất cả" : s === "PENDING" ? "Chờ duyệt" : s === "ACTIVE" ? "Đang bán" :
             s === "REJECTED" ? "Bị từ chối" : s === "INACTIVE" ? "Đã ẩn" : s === "RESERVED" ? "Đang giữ" : "Đã bán"}
          </Button>
        ))}
      </div>

      {error && (
        <InlineAlert tone="danger" title="Lỗi tải dữ liệu" onClose={() => refetch()}>
          Không tải được danh sách tin. <Button variant="ghost" size="md" onClick={() => refetch()}>Thử lại</Button>
        </InlineAlert>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <ProductCardSkeleton key={i} />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Chưa có tin đăng nào"
          description={status === "ALL" ? "Hãy đăng tin đầu tiên của bạn ngay hôm nay." : `Không có tin ở trạng thái "${status}".`}
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

          {/* Pagination */}
          {data && data.meta.total_pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="ghost"
                size="md"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                Trước
              </Button>
              <span className="px-3 text-sm text-neutral-600">
                Trang {page} / {data.meta.total_pages}
              </span>
              <Button
                variant="ghost"
                size="md"
                onClick={() => setPage((p) => Math.min(data.meta.total_pages, p + 1))}
                disabled={page === data.meta.total_pages}
              >
                Sau
              </Button>
            </div>
          )}
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
    <div className="group bg-white rounded-xl border border-neutral-200 overflow-hidden hover:shadow-lg transition-shadow">
      <div className="relative aspect-[4/3] bg-neutral-100 overflow-hidden">
        {product.image_url ? (
          <img src={product.image_url} alt={product.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400">Không có ảnh</div>
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
            {product.status === "PENDING" ? "Chờ duyệt" : product.status === "ACTIVE" ? "Đang bán" :
             product.status === "REJECTED" ? "Bị từ chối" : product.status === "INACTIVE" ? "Đã ẩn" :
             product.status === "RESERVED" ? "Đang giữ" : "Đã bán"}
          </Badge>
          {product.is_blocked && <Badge variant="danger">Bị hạn chế</Badge>}
          {product.is_hidden && <Badge variant="neutral">Đã ẩn</Badge>}
        </div>
      </div>

      <div className="p-4 space-y-2.5">
        <h3 className="font-medium text-neutral-900 line-clamp-2 group-hover:text-primary transition-colors">
          {product.title}
        </h3>

        <div className="flex items-center gap-3 text-sm text-neutral-500">
          <span>{conditionLabel(product.condition)}</span>
          <span>•</span>
          <span>{formatVnd(product.price)}</span>
        </div>

        <div className="flex items-center justify-between text-sm text-neutral-500">
          <span>{formatRelative(product.created_at)}</span>
          {product.published_at && <span>• Đã duyệt: {formatRelative(product.published_at)}</span>}
        </div>

        {product.rejection_reason && (
          <p className="text-sm text-danger bg-danger/5 rounded p-2">
            Lý do từ chối: {product.rejection_reason}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-neutral-100">
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
                    action === "hide" ? "border-warning text-warning" : ""
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
