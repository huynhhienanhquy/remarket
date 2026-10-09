import { useSellerProfile } from "./hooks/useSellerProfile";
import { Stars } from "./sections/Stars";
import { formatDateTime, formatRelative } from "@remarket/shared";
import { isApiError } from "../../helpers/errors";
import { loginPathFor } from "../../config/route/guards";
import { Button, ApiImage, EmptyState, InlineAlert, Pagination, ProductCard, ProductCardSkeleton, Skeleton, Tabs } from "../../components/common";
import { ReportDialog } from "../../components/ReportDialog/ReportDialog";

export function SellerProfilePage() {
  const {
    id,
    searchParams,
    setSearchParams,
    navigate,
    viewer,
    reportOpen,
    setReportOpen,
    menuOpen,
    setMenuOpen,
    tab,
    page,
    profile,
    products,
    reviews,
    setTab,
    toggleFavorite,
  } = useSellerProfile();

  if (profile.isPending) {
    return (
      <div className="rm-container py-6 lg:py-8">
        <div className="flex items-center gap-4">
          <Skeleton w="80px" h="80px" radius="50%" />
          <div className="space-y-2">
            <Skeleton w="200px" h="24px" />
            <Skeleton w="280px" h="16px" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (profile.isError || !profile.data) {
    const notFound = isApiError(profile.error) && profile.error.status === 404;
    return (
      <div className="rm-container py-12">
        <EmptyState
          title={notFound ? "Không tìm thấy người dùng này" : "Không tải được hồ sơ"}
          description={
            notFound ? "Hồ sơ có thể đã bị xóa." : "Vui lòng thử lại sau."
          }
          action={{ label: "Về trang chủ", to: "/" }}
        />
      </div>
    );
  }

  const seller = profile.data.seller;
  const isSelf = viewer?.id === seller.id;
  const ratingText =
    seller.rating === null
      ? "Chưa có đánh giá"
      : `${String(seller.rating).replace(".", ",")}/5 · ${seller.review_count} đánh giá`;

  return (
    <div className="rm-container py-6 lg:py-8">
      {/* Profile header card — no cover image (ui-spec 10) */}
      <section className="relative rounded-card border border-line bg-surface p-5 lg:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {seller.avatar_url ? (
            <ApiImage
              src={seller.avatar_url}
              alt=""
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-brand-soft text-2xl font-semibold text-brand"
            >
              {seller.name.trim().slice(0, 1).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-bold text-ink lg:text-[26px]">
              {seller.name}
            </h1>
            <p className="mt-1 t-body text-muted">{seller.province_label ?? "Chưa cập nhật khu vực"}</p>
            <p className="mt-1 t-meta text-muted">
              Tham gia{" "}
              <time dateTime={seller.joined_at}>{formatDateTime(seller.joined_at)}</time>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1">
              <span className="t-body text-ink">{ratingText}</span>
              <span className="t-body text-ink">
                {seller.completed_sales_count} đơn bán hoàn tất
              </span>
            </div>
          </div>

          {/* Report lives in a menu at the top-right, hidden for the owner */}
          {!isSelf && (
            <div className="relative shrink-0 self-start">
              <Button
                variant="ghost"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Tùy chọn hồ sơ"
                onClick={() => setMenuOpen((value) => !value)}
              >
                ⋯
              </Button>
              {menuOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+6px)] z-header w-52 rounded-card border border-line bg-surface p-1.5 shadow-pop"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      if (!viewer) {
                        navigate(loginPathFor(`/users/${id}`, ""));
                        return;
                      }
                      setReportOpen(true);
                    }}
                    className="block w-full rounded-control px-3 py-2.5 text-left t-body text-ink hover:bg-surface-subtle"
                  >
                    Báo cáo người dùng
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Tabs synced to ?tab= */}
      <div className="mt-6">
        <Tabs
          ariaLabel="Nội dung hồ sơ"
          value={tab}
          onChange={(value) => setTab(value as "products" | "reviews")}
          tabs={[
            { value: "products", label: "Đang bán" },
            { value: "reviews", label: "Đánh giá" },
          ]}
        />
      </div>

      {tab === "products" ? (
        <div className="mt-6" aria-busy={products.isFetching || undefined}>
          {products.isPending ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : products.isError ? (
            <InlineAlert
              tone="danger"
              title="Không tải được tin đang bán"
              action={
                <Button variant="secondary" onClick={() => products.refetch()}>
                  Tải lại
                </Button>
              }
            />
          ) : products.data.items.length === 0 ? (
            <EmptyState
              title="Người bán chưa có tin đang bán"
              description="Quay lại sau để xem các món đồ mới của họ."
              action={{ label: "Khám phá sản phẩm", to: "/products" }}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {products.data.items.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onToggleFavorite={(item) => toggleFavorite(item.id, !item.is_favorited)}
                  />
                ))}
              </div>
              <Pagination
                className="mt-8"
                page={products.data.meta.page}
                totalPages={products.data.meta.total_pages}
                total={products.data.meta.total}
                onPageChange={(next) => {
                  const params = new URLSearchParams(searchParams);
                  params.set("page", String(next));
                  setSearchParams(params);
                }}
              />
            </>
          )}
        </div>
      ) : (
        <div className="mt-6" aria-busy={reviews.isFetching || undefined}>
          {reviews.isPending ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="w-full" h="88px" radius="12px" />
              ))}
            </div>
          ) : reviews.isError ? (
            <InlineAlert
              tone="danger"
              title="Không tải được đánh giá"
              action={
                <Button variant="secondary" onClick={() => reviews.refetch()}>
                  Tải lại
                </Button>
              }
            />
          ) : reviews.data.items.length === 0 ? (
            <EmptyState
              title="Chưa có đánh giá"
              description="Người bán này chưa nhận đánh giá nào."
            />
          ) : (
            <>
              <ul className="space-y-3">
                {reviews.data.items.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-card border border-line bg-surface p-4"
                  >
                    <div className="flex items-start gap-3">
                      {review.reviewer.avatar_url ? (
                        <ApiImage
                          src={review.reviewer.avatar_url}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft t-label text-brand"
                        >
                          {review.reviewer.name.trim().slice(0, 1).toUpperCase()}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="t-label text-ink">{review.reviewer.name}</span>
                          <Stars rating={review.rating} />
                          <time
                            dateTime={review.created_at}
                            className="t-meta text-muted"
                            title={formatDateTime(review.created_at)}
                          >
                            {formatRelative(review.created_at)}
                          </time>
                        </div>
                        {review.comment && (
                          <p className="mt-2 whitespace-pre-wrap t-body text-ink">
                            {review.comment}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <Pagination
                className="mt-8"
                page={page}
                totalPages={Math.max(1, Math.ceil(reviews.data.meta.total / 10))}
                total={reviews.data.meta.total}
                onPageChange={(next) => {
                  const params = new URLSearchParams(searchParams);
                  params.set("page", String(next));
                  setSearchParams(params);
                }}
              />
            </>
          )}
        </div>
      )}

      {reportOpen && (
        <ReportDialog
          open
          onClose={() => setReportOpen(false)}
          target={{ target_type: "user", user_id: seller.id }}
          targetLabel={seller.name}
        />
      )}
    </div>
  );
}
