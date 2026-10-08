import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CONDITION_LABELS,
  DELIVERY_LABELS,
  PRODUCT_STATUS_LABELS,
  formatRelative,
  formatDateTime,
  formatVnd,
} from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { isApiError } from "../../lib/errors";
import { useSession } from "../../app/SessionProvider";
import { loginPathFor } from "../../app/guards";
import {
  Button,
  CartIcon,
  ChatIcon,
  EmptyState,
  HeartIcon,
  ImageViewer,
  InlineAlert,
  SectionCard,
  Skeleton,
  StatusBadge,
  UserSummary,
  useToast,
} from "../../components/ui";
import { ReportDialog } from "../../components/features/ReportDialog";

export function ProductDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { viewer } = useSession();

  const [activeImage, setActiveImage] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const detail = useQuery({
    queryKey: queryKeys.product(id),
    queryFn: () => api.products.detail(id),
    enabled: id !== "",
  });

  const product = detail.data;

  const toggleFavorite = useMutation({
    mutationFn: (on: boolean) => api.favorites.set(id, on),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.product(id) }),
    onError: (error) => toast.error("Không lưu được món đồ", { description: error.message }),
  });

  const addToCart = useMutation({
    mutationFn: () => api.cart.add(id),
    onSuccess: () => {
      toast.success("Đã thêm vào giỏ hàng", {
        action: { label: "Xem giỏ hàng", to: "/cart" },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.cart });
    },
    onError: (error) =>
      toast.error(isApiError(error) && error.code === "VERSION_CONFLICT" ? "Món đồ đã thay đổi" : "Không thêm được vào giỏ", {
        description: error.message,
      }),
  });

  const loginThen = loginPathFor(location.pathname, location.search);

  function requireLogin() {
    if (viewer) return true;
    navigate(loginThen);
    return false;
  }

  function openChat() {
    if (!requireLogin() || !product) return;
    api.chat
      .open(product.id)
      .then((conversation) => navigate(`/messages/${conversation.id}`))
      .catch((error) => toast.error("Không mở được tin nhắn", { description: error.message }));
  }

  function buyNow() {
    if (!requireLogin() || !product) return;
    api.cart
      .add(product.id)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: queryKeys.cart });
        navigate("/checkout");
      })
      .catch((error) => toast.error("Không khởi tạo được đơn hàng", { description: error.message }));
  }

  const images = product?.images ?? [];
  const mainImage = images[activeImage] ?? images[0];

  const unavailableBanner = useMemo(() => {
    if (!product) return null;
    if (product.status === "RESERVED") {
      return {
        tone: "info" as const,
        title: "Sản phẩm đang được giữ cho một giao dịch",
      };
    }
    if (product.status === "SOLD") {
      return { tone: "neutral" as const, title: "Sản phẩm đã bán" };
    }
    if (product.is_blocked) {
      return { tone: "danger" as const, title: "Tin đăng không còn khả dụng" };
    }
    if (product.status === "REJECTED" && product.rejection_reason) {
      return { tone: "warning" as const, title: "Tin đăng không được phê duyệt", body: product.rejection_reason };
    }
    return null;
  }, [product]);

  if (detail.isPending) {
    return (
      <div className="rm-container py-6 lg:py-8">
        <div className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Skeleton className="aspect-[4/3] w-full" radius="12px" />
            <div className="mt-3 flex gap-2">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} w="64px" h="64px" radius="8px" />
              ))}
            </div>
          </div>
          <div className="space-y-4 lg:col-span-5">
            <Skeleton w="60%" h="20px" />
            <Skeleton w="80%" h="32px" />
            <Skeleton w="40%" h="28px" />
            <Skeleton className="w-full" h="120px" />
          </div>
        </div>
      </div>
    );
  }

  if (detail.isError || !product) {
    const notFound = isApiError(detail.error) && detail.error.status === 404;
    return (
      <div className="rm-container py-12">
        <EmptyState
          title={notFound ? "Không tìm thấy tin đăng này" : "Không tải được sản phẩm"}
          description={
            notFound
              ? "Tin đăng có thể đã bị gỡ hoặc bạn không có quyền xem."
              : "Vui lòng thử lại sau."
          }
          action={{ label: "Khám phá sản phẩm", to: "/products" }}
        />
      </div>
    );
  }

  const isOwner = viewer?.id === product.seller.id;
  const statusMeta = PRODUCT_STATUS_LABELS[product.status];
  const canBuy = product.capabilities.can_buy && !isOwner;
  const canCart = product.capabilities.can_add_to_cart && !isOwner;
  const canChat = product.capabilities.can_chat && !isOwner;
  const hidden = product.is_hidden === true;

  const specs: { label: string; value: string }[] = [
    { label: "Danh mục", value: product.category_path.join(" › ") },
    ...(product.usage_months !== null
      ? [{ label: "Đã sử dụng", value: `${product.usage_months} tháng` }]
      : []),
    { label: "Giao nhận", value: DELIVERY_LABELS[product.delivery_method] },
    ...(product.delivery_method !== "MEETUP"
      ? [{ label: "Phí giao hàng", value: formatVnd(product.shipping_fee) }]
      : []),
    { label: "Khu vực", value: product.province_label ?? "Chưa cập nhật" },
    {
      label: "Đăng lúc",
      value: formatDateTime(product.published_at ?? product.created_at),
    },
  ];

  return (
    <div className="rm-container py-6 lg:py-8">
      <nav aria-label="Đường dẫn" className="t-meta text-muted">
        <Link to="/" className="hover:text-ink">
          Trang chủ
        </Link>
        <span aria-hidden="true"> / </span>
        <Link to="/products" className="hover:text-ink">
          Sản phẩm
        </Link>
        <span aria-hidden="true"> / </span>
        <span className="text-ink">{hidden ? "Tin đăng" : product.title}</span>
      </nav>

      {unavailableBanner && (
        <div className="mt-4">
          <InlineAlert tone={unavailableBanner.tone} title={unavailableBanner.title}>
            {unavailableBanner.body}
            {product.capabilities.unavailable_reason && !unavailableBanner.body
              ? product.capabilities.unavailable_reason
              : null}
          </InlineAlert>
        </div>
      )}
      {product.is_blocked && product.block_reason && (
        <div className="mt-4">
          <InlineAlert tone="danger" title="Tin đăng bị hạn chế">
            {product.block_reason}
          </InlineAlert>
        </div>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-12">
        {/* Gallery */}
        <div className="lg:col-span-7">
          {hidden ? (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 rounded-card bg-surface-subtle">
              <p className="t-h3 text-muted">Tin đăng không còn khả dụng</p>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => images.length > 0 && setViewerOpen(true)}
                className="block w-full"
                aria-label="Xem ảnh lớn"
              >
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-card bg-surface-subtle">
                  {mainImage ? (
                    <img
                      src={mainImage.url}
                      alt={`${product.title} — ảnh ${activeImage + 1}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="t-body text-muted">Chưa có ảnh</span>
                  )}
                </div>
              </button>
              {images.length > 1 && (
                <div className="scrollbar-thin mt-3 flex gap-2 overflow-x-auto pb-1">
                  {images.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setActiveImage(index)}
                      aria-label={`Ảnh ${index + 1}`}
                      aria-current={index === activeImage}
                      className={[
                        "h-16 w-16 shrink-0 overflow-hidden rounded-control border-2 bg-surface-subtle",
                        index === activeImage ? "border-brand" : "border-transparent",
                      ].join(" ")}
                    >
                      <img
                        src={image.url}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Summary */}
        <div className="lg:col-span-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-label text-muted">
              {CONDITION_LABELS[product.condition]}
            </span>
            <StatusBadge label={statusMeta.label} tone={statusMeta.tone} />
            {product.is_blocked && <StatusBadge label="Bị hạn chế" tone="danger" />}
          </div>

          <h1 className="mt-3 text-[22px] font-bold leading-snug text-ink lg:text-[28px]">
            {hidden ? "Tin đăng không còn khả dụng" : product.title}
          </h1>

          <p className="mt-3 t-price-detail text-ink">
            {hidden ? "" : formatVnd(product.price)}
          </p>

          <p className="mt-2 t-meta text-muted">
            {product.province_label ?? "Chưa cập nhật khu vực"} ·{" "}
            <time dateTime={product.published_at ?? product.created_at}>
              {formatRelative(product.published_at ?? product.created_at)}
            </time>
          </p>

          <dl className="mt-5 divide-y divide-line rounded-card border border-line bg-surface">
            {specs.map((spec) => (
              <div key={spec.label} className="flex justify-between gap-4 px-4 py-3">
                <dt className="t-body text-muted">{spec.label}</dt>
                <dd className="text-right t-body text-ink">{spec.value}</dd>
              </div>
            ))}
          </dl>

          {/* Desktop actions */}
          <div className="mt-5 hidden lg:block">
            <div className="space-y-3">
              <Button
                variant="primary"
                size="lg"
                fullWidth
                disabled={!canBuy}
                onClick={buyNow}
              >
                Mua ngay
              </Button>
              <Button
                variant="secondary"
                fullWidth
                disabled={!canCart}
                loading={addToCart.isPending}
                onClick={() => addToCart.mutate()}
              >
                Thêm vào giỏ
              </Button>
              <Button
                variant="secondary"
                fullWidth
                disabled={!canChat}
                onClick={openChat}
              >
                <ChatIcon />
                Chat với người bán
              </Button>
            </div>
            {product.capabilities.unavailable_reason && (
              <p className="mt-2 t-meta text-muted">{product.capabilities.unavailable_reason}</p>
            )}
            <div className="mt-4 flex items-center justify-between">
              <button
                type="button"
                disabled={!product.capabilities.can_favorite}
                onClick={() => requireLogin() && toggleFavorite.mutate(!product.is_favorited)}
                className="flex items-center gap-2 t-label text-ink hover:text-danger disabled:opacity-50"
              >
                <HeartIcon
                  className={product.is_favorited ? "fill-current text-danger" : undefined}
                />
                {product.is_favorited ? "Đã yêu thích" : "Yêu thích"}
              </button>
              <button
                type="button"
                disabled={!product.capabilities.can_report || isOwner}
                onClick={() => requireLogin() && setReportOpen(true)}
                className="t-label text-muted hover:text-ink disabled:opacity-50"
              >
                Báo cáo tin đăng
              </button>
            </div>
            {(isOwner || viewer?.role === "ADMIN") && (
              <div className="mt-4 flex gap-3">
                {product.capabilities.can_edit && (
                  <Link to={`/account/products/${product.id}/edit`} className="flex-1">
                    <Button variant="secondary" fullWidth>
                      Chỉnh sửa tin
                    </Button>
                  </Link>
                )}
                <Link to="/account/products" className="flex-1">
                  <Button variant="ghost" fullWidth>
                    Quản lý tin
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Seller */}
      <div className="mt-8">
        <SectionCard title="Người bán">
          <UserSummary user={product.seller} size="lg" />
        </SectionCard>
      </div>

      {/* Description */}
      <div className="mt-6">
        <SectionCard title="Mô tả sản phẩm">
          <p className="whitespace-pre-wrap t-body text-ink">
            {hidden ? "Nội dung đã bị gỡ." : product.description}
          </p>
        </SectionCard>
      </div>

      {/* Mobile sticky action bar */}
      <div className="rm-safe-bottom fixed inset-x-0 bottom-0 z-action-bar border-t border-line bg-surface px-4 py-3 lg:hidden">
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            disabled={!canChat}
            onClick={openChat}
            aria-label="Chat với người bán"
            className="min-h-[44px] flex-1"
          >
            <ChatIcon />
            Chat
          </Button>
          <button
            type="button"
            disabled={!canCart}
            onClick={() => addToCart.mutate()}
            aria-label="Thêm vào giỏ hàng"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-brand text-brand disabled:opacity-50"
          >
            <CartIcon />
          </button>
          <Button
            variant="primary"
            disabled={!canBuy}
            onClick={buyNow}
            className="min-h-[44px] flex-1"
          >
            Mua ngay
          </Button>
        </div>
      </div>
      {/* Spacer so the fixed bar never covers the description */}
      <div className="h-24 lg:hidden" />

      {images.length > 0 && viewerOpen && (
        <ImageViewer
          images={images}
          startIndex={activeImage}
          onClose={() => setViewerOpen(false)}
          alt={product.title}
        />
      )}

      {reportOpen && (
        <ReportDialog
          open
          onClose={() => setReportOpen(false)}
          target={{ target_type: "product", product_id: product.id }}
          targetLabel={product.title}
        />
      )}
    </div>
  );
}
