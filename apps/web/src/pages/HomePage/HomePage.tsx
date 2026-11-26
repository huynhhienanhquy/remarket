import heroImage from "../../../../../packages/shared/assets/marketplace-hero.jpg";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CategoryNode, ProductListItem } from "@remarket/shared";
import { api, apiForQuery } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { useSession } from "../../contexts/SessionContext";
import { loginPathFor } from "../../config/route/guards";
import { Button, buttonClasses } from "../../components/common/Button/Button";
import { CameraIcon, CartIcon, CategoryIcon, ChatIcon, ChevronRightIcon, PlusIcon } from "../../components/common/Icon/Icon";
import { EmptyState } from "../../components/common/EmptyState/EmptyState";
import { InlineAlert } from "../../components/common/InlineAlert/InlineAlert";
import { ProductCard } from "../../components/common/ProductCard/ProductCard";
import { ProductCardSkeleton } from "../../components/common/Skeleton/Skeleton";

const LATEST_GRID = "mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 xl:grid-cols-5";

const STEPS = [
  {
    icon: CameraIcon,
    title: "Đăng tin",
    body: "Chụp ảnh, mô tả tình trạng món đồ và mức giá bạn muốn bán.",
  },
  {
    icon: ChatIcon,
    title: "Trao đổi",
    body: "Nhắn tin trực tiếp để thống nhất tình trạng, giá và cách giao nhận.",
  },
  {
    icon: CartIcon,
    title: "Giao nhận",
    body: "Gặp trực tiếp hoặc giao hàng, trả tiền mặt khi nhận được món đồ.",
  },
];

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { viewer, status } = useSession();

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => apiForQuery(signal).categories.tree(),
    enabled: status === "ready",
    staleTime: 5 * 60_000,
  });

  const latest = useQuery({
    queryKey: queryKeys.products({ sort: "newest", page_size: 10 }),
    queryFn: ({ signal }) => apiForQuery(signal).products.list({ sort: "newest", page_size: 10, page: 1 }),
    enabled: status === "ready",
  });

  const favorites = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => api.favorites.set(id, on),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["products"] }),
  });

  function toggleFavorite(product: ProductListItem) {
    if (!viewer) {
      navigate(loginPathFor("/", ""));
      return;
    }
    favorites.mutate({ id: product.id, on: !product.is_favorited });
  }

  const roots = (categories.data ?? [])
    .filter(entry => entry.status === "ACTIVE")
    .flatMap(entry => [entry, ...(entry.children ?? []).filter(child => child.status === "ACTIVE" && child.show_on_home === true)])
    .filter(entry => entry.show_on_home !== false)
    .sort((left, right) => Number(right.show_on_home === true) - Number(left.show_on_home === true) || (left.sort_index ?? 0) - (right.sort_index ?? 0))
    .slice(0, 6);
  const items = latest.data?.items ?? [];
  const sellPath = viewer ? "/account/products/new" : loginPathFor("/account/products/new", "");

  return (
    <>
      {/* Hero */}
      <section className="rm-container pt-4 lg:pt-7">
        <div className="grid overflow-hidden rounded-[24px] bg-[#143d2d] text-white sm:grid-cols-[1.1fr_0.9fr]">
          <div className="flex min-w-0 flex-col items-start justify-center px-5 py-8 sm:px-8 lg:px-12 lg:py-12">
            <h1 className="text-[clamp(1.9rem,4.6vw,3.75rem)] font-bold leading-[1.09] tracking-[-0.045em]">
              Món đồ cũ.<br /><span className="text-[#cce6a7]">Giá trị mới.</span>
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-[#e2eee4] sm:text-base">
              Tìm mua món đồ đã qua sử dụng hoặc đăng bán những gì bạn không còn cần.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 sm:gap-3">
              <Link to="/products" className={`${buttonClasses()} rm-button-primary-light !rounded-xl !bg-[#cce6a7] !text-[#143d2d] hover:!bg-[#e1f2c9]`}>
                <span className="rm-button-content inline-flex items-center gap-2">
                  Khám phá <ChevronRightIcon size={16} className="rm-icon-forward" />
                </span>
              </Link>
              <Link
                to={sellPath}
                className={`${buttonClasses("secondary")} !rounded-xl !border-white/35 !bg-transparent !text-white hover:!bg-white/10`}
              >
                <span className="rm-button-content inline-flex items-center gap-2">
                  <PlusIcon size={16} className="rm-icon-forward" /> Đăng bán
                </span>
              </Link>
            </div>
          </div>
          <div className="relative h-32 min-w-0 bg-[#7e8051] sm:h-auto">
            <img src={heroImage} alt="" width={1050} height={700} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover object-[center_65%]" />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-7 lg:py-9" aria-labelledby="home-categories">
        <div className="rm-container">
          <h2 id="home-categories" className="t-h2 text-ink">Danh mục sản phẩm</h2>
          {categories.isPending ? (
            <div className="mt-4 grid grid-cols-3 gap-3 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="rm-skeleton min-h-24 rounded-2xl" />
              ))}
            </div>
          ) : categories.isError ? (
            <div className="mt-5">
              <InlineAlert tone="danger" title="Không tải được danh mục">
                <button
                  type="button"
                  onClick={() => categories.refetch()}
                  className="t-label text-brand underline"
                >
                  Tải lại
                </button>
              </InlineAlert>
            </div>
          ) : roots.length === 0 ? (
            <p className="mt-4 t-body text-muted">Chưa có danh mục nào.</p>
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-3 lg:grid-cols-6">
              {roots.map((root: CategoryNode) => (
                <Link
                  key={root.id}
                  to={`/products?category_id=${root.id}`}
                  className="rm-card-tile grid min-w-0 rounded-2xl"
                >
                  <span className="rm-card-face flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface px-2 py-3 text-center">
                    <span className="rm-card-light" aria-hidden="true" />
                    <span className="rm-card-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                      <CategoryIcon slug={root.slug} symbol={root.icon} size={20} />
                    </span>
                    <span className="rm-card-layer max-w-full break-words text-xs font-semibold leading-[18px] text-ink sm:text-sm">{root.name}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Latest listings */}
      <section className="pb-8 lg:pb-12" aria-labelledby="home-latest">
        <div className="rm-container">
          <div className="flex items-center justify-between gap-4">
            <h2 id="home-latest" className="t-h2 text-ink">
              Mới đăng gần đây
            </h2>
            <Link to="/products" className="rm-control inline-flex min-h-touch shrink-0 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-brand hover:bg-brand-soft">
              Xem tất cả <ChevronRightIcon size={16} className="rm-icon-forward" />
            </Link>
          </div>

          {latest.isPending ? (
            <div className={LATEST_GRID}>
              {Array.from({ length: 10 }, (_, index) => (
                <ProductCardSkeleton key={index} />
              ))}
            </div>
          ) : latest.isError ? (
            <div className="mt-5">
              <InlineAlert
                tone="danger"
                title="Không tải được danh sách sản phẩm"
                action={
                  <Button variant="secondary" onClick={() => latest.refetch()}>
                    Tải lại
                  </Button>
                }
              />
            </div>
          ) : items.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="Chưa có tin đăng nào"
                description="Hãy là người đầu tiên đăng món đồ của bạn."
                action={{ label: "Đăng món đồ đầu tiên", to: sellPath }}
              />
            </div>
          ) : (
            <div className={LATEST_GRID}>
              {items.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Three steps */}
      <section className="rm-section border-t border-line bg-brand-soft/50" aria-labelledby="home-steps">
        <div className="rm-container">
          <h2 id="home-steps" className="t-h2 text-ink">
            Ba bước để trao đổi món đồ
          </h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {STEPS.map(({ title, body, icon: StepIcon }) => (
              <div key={title} className="rm-card-feature min-w-0">
                <div className="rm-card-face h-full rounded-2xl border border-line bg-surface p-5">
                  <span className="rm-card-light" aria-hidden="true" />
                  <span className="rm-card-icon grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">
                    <StepIcon />
                  </span>
                  <h3 className="rm-card-layer mt-3 t-h3 text-ink">{title}</h3>
                  <p className="rm-card-copy mt-2 text-sm leading-6 text-muted">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
