import { HeroArt } from "../../assets/images/illustrations/HeroArt";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CategoryNode, ProductListItem } from "@remarket/shared";
import { api } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { useSession } from "../../contexts/SessionContext";
import { loginPathFor } from "../../config/route/guards";
import {
  Button,
  CategoryIcon,
  EmptyState,
  InlineAlert,
  ProductCard,
  ProductCardSkeleton,
} from "../../components/common";

const STEPS = [
  {
    title: "Đăng tin",
    body: "Chụp ảnh, mô tả tình trạng món đồ và mức giá bạn muốn bán.",
  },
  {
    title: "Trao đổi",
    body: "Nhắn tin trực tiếp để thống nhất tình trạng, giá và cách giao nhận.",
  },
  {
    title: "Giao nhận",
    body: "Gặp trực tiếp hoặc giao hàng, trả tiền mặt khi nhận được món đồ.",
  },
];

/* ------------------------------------------------------------------ */

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { viewer } = useSession();

  const categories = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.categories.tree(),
    staleTime: 5 * 60_000,
  });

  const latest = useQuery({
    queryKey: queryKeys.products({ sort: "newest", page_size: 10 }),
    queryFn: () => api.products.list({ sort: "newest", page_size: 10, page: 1 }),
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

  const roots = (categories.data ?? []).filter((entry) => entry.status === "ACTIVE").slice(0, 6);
  const items = latest.data?.items ?? [];

  return (
    <>
      {/* Hero */}
      <section className="rm-container pt-6 lg:pt-8">
        <div className="flex flex-col gap-6 rounded-modal bg-brand-soft px-6 py-8 lg:flex-row lg:items-center lg:gap-8 lg:px-10 lg:py-10">
          <div className="lg:w-[60%]">
            <p className="t-label uppercase tracking-wide text-brand">
              Mua bán đồ đã qua sử dụng
            </p>
            <h1 className="mt-3 text-[28px] font-bold leading-tight text-ink lg:text-[36px]">
              Món đồ cũ. Giá trị mới.
            </h1>
            <p className="mt-3 max-w-lg t-body text-muted">
              Tìm món bạn cần, nhường món bạn không còn dùng.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/products">
                <Button variant="primary">Khám phá sản phẩm</Button>
              </Link>
              <Link to={viewer ? "/account/products/new" : loginPathFor("/", "")}>
                <Button variant="secondary">Đăng bán ngay</Button>
              </Link>
            </div>
          </div>
          <div className="hidden justify-center lg:flex lg:w-[40%]">
            <HeroArt />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="rm-section" aria-labelledby="home-categories">
        <div className="rm-container">
          <h2 id="home-categories" className="t-h2 text-ink">
            Khám phá theo danh mục
          </h2>
          {categories.isPending ? (
            <div className="mt-5 grid grid-cols-3 gap-3 lg:grid-cols-6">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="rm-skeleton h-24" />
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
            <div className="mt-5 grid grid-cols-3 gap-3 lg:grid-cols-6">
              {roots.map((root: CategoryNode) => (
                <Link
                  key={root.id}
                  to={`/products?category_id=${root.id}`}
                  className="flex flex-col items-center gap-2 rounded-card border border-line bg-surface px-3 py-4 text-center transition-colors hover:border-brand hover:bg-brand-soft"
                >
                  <span className="text-brand">
                    <CategoryIcon slug={root.slug} size={24} />
                  </span>
                  <span className="t-meta text-ink">{root.name}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Latest listings */}
      <section className="rm-section pt-0" aria-labelledby="home-latest">
        <div className="rm-container">
          <div className="flex items-center justify-between gap-4">
            <h2 id="home-latest" className="t-h2 text-ink">
              Mới đăng gần đây
            </h2>
            <Link to="/products" className="t-label text-brand hover:underline">
              Xem tất cả
            </Link>
          </div>

          {latest.isPending ? (
            <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
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
                action={
                  viewer
                    ? { label: "Đăng món đồ đầu tiên", to: "/account/products/new" }
                    : { label: "Đăng món đồ đầu tiên", to: loginPathFor("/", "") }
                }
              />
            </div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
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
      <section className="rm-section border-t border-line bg-surface" aria-labelledby="home-steps">
        <div className="rm-container">
          <h2 id="home-steps" className="t-h2 text-ink">
            Ba bước để trao đổi món đồ
          </h2>
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {STEPS.map((step, index) => (
              <div key={step.title} className="rounded-card border border-line bg-page p-5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft t-label text-brand">
                  {index + 1}
                </span>
                <h3 className="mt-3 t-h3 text-ink">{step.title}</h3>
                <p className="mt-2 t-body text-muted">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
