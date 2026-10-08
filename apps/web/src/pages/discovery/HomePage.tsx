import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CategoryNode, ProductListItem } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { useSession } from "../../app/SessionProvider";
import { loginPathFor } from "../../app/guards";
import {
  Button,
  EmptyState,
  InlineAlert,
  ProductCard,
  ProductCardSkeleton,
} from "../../components/ui";

/* ------------------------------------------------------------------ */
/* Hero illustration: three static item cards, no carousel (ui-spec 7) */
/* ------------------------------------------------------------------ */

function HeroArt() {
  return (
    <svg
      viewBox="0 0 320 220"
      role="img"
      aria-label="Minh họa ba món đồ được đăng tin trên ReMarket"
      className="h-auto w-full max-w-[320px]"
    >
      <rect x="8" y="46" width="132" height="150" rx="12" fill="#FFFFFF" stroke="#DDE4DC" />
      <rect x="24" y="62" width="100" height="66" rx="8" fill="#E8F3EC" />
      <path d="M40 106l18-18 14 14 10-10 22 22H40z" fill="#17633F" opacity="0.35" />
      <rect x="24" y="140" width="84" height="10" rx="5" fill="#DDE4DC" />
      <rect x="24" y="158" width="52" height="10" rx="5" fill="#17633F" opacity="0.5" />

      <rect x="96" y="18" width="140" height="156" rx="12" fill="#FFFFFF" stroke="#DDE4DC" />
      <rect x="114" y="36" width="104" height="72" rx="8" fill="#F0F3EE" />
      <circle cx="150" cy="66" r="14" fill="#17633F" opacity="0.3" />
      <path d="M132 96l20-20 16 16 12-12 30 30h-78z" fill="#17633F" opacity="0.35" />
      <rect x="114" y="120" width="90" height="10" rx="5" fill="#DDE4DC" />
      <rect x="114" y="138" width="58" height="10" rx="5" fill="#17633F" opacity="0.5" />

      <rect x="184" y="72" width="124" height="132" rx="12" fill="#FFFFFF" stroke="#DDE4DC" />
      <rect x="200" y="88" width="92" height="60" rx="8" fill="#E8F3EC" />
      <path d="M214 130l16-16 12 12 10-10 26 26h-64z" fill="#17633F" opacity="0.35" />
      <rect x="200" y="160" width="76" height="10" rx="5" fill="#DDE4DC" />
      <rect x="200" y="178" width="46" height="10" rx="5" fill="#17633F" opacity="0.5" />
    </svg>
  );
}

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

/** Neutral glyph per root category, chosen by slug; falls back to a tag. */
function CategoryGlyph({ slug }: { slug: string }) {
  const paths: Record<string, string> = {
    "dien-tu": "M4 5h16v11H4zM9 20h6M12 16v4",
    "thoi-trang": "M8 4l4 2 4-2 4 4-3 2v10H7V10L4 8z",
    "noi-that": "M5 10V7a3 3 0 013-3h8a3 3 0 013 3v3M4 10h16v6H4zM7 16v3M17 16v3",
    "sach-van-phong": "M4 5a2 2 0 012-2h12v18H6a2 2 0 00-2-2zM8 7h7",
    "xe-co": "M5 16h14M6 16l1.5-6h9L18 16M7 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
    "gia-dung": "M6 4h12l-1 16H7zM6 9h12",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-6 w-6"
    >
      <path d={paths[slug] ?? "M4 7l8-4 8 4v10l-8 4-8-4zM12 3v18"} />
    </svg>
  );
}

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
                    <CategoryGlyph slug={root.slug} />
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
