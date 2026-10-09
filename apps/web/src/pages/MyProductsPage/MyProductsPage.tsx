import { useOwnProducts } from "./hooks/useOwnProducts";
import { FILTERS } from "./filters";
import { ProductCard } from "./sections/OwnProductCard";
import { Link } from "react-router-dom";
import { Pagination, ProductCardSkeleton, ConfirmDialog, buttonClasses } from "../../components/common";
import { PRODUCT_STATUS_LABELS } from "@remarket/shared";
import { OfflineNotice, QueryFailure } from "../../components/common/PageFeedback/PageFeedback";
import { AccountEmptyState, AccountFilters, AccountPageHeader } from "../../components/AccountPageHeader/AccountPageHeader";

export function MyProductsPage() {
  const {
    navigate,
    viewer,
    online,
    setParams,
    status,
    page,
    setPage,
    dialog,
    setDialog,
    data,
    isLoading,
    error,
    refetch,
    hideMutation,
    deleteMutation,
    submitMutation,
    handleAction,
    confirmDialogAction,
  } = useOwnProducts();

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
