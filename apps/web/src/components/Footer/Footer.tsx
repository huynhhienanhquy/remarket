import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CategoryNode } from "@remarket/shared";
import { api } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { Logo } from "../Logo/Logo";

/**
 * Marketing footer: discovery and public profiles only (ui-spec 3). No policy
 * links are rendered until real content and routes exist.
 */
export function Footer() {
  const { data: categories } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: () => api.categories.tree(),
    staleTime: 5 * 60_000,
  });
  const roots: CategoryNode[] = (categories ?? []).filter(
    (entry) => entry.status === "ACTIVE",
  );

  return (
    <footer className="border-t border-line bg-surface">
      <div className="rm-container grid gap-8 py-10 lg:grid-cols-[1fr_2fr] lg:py-12">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs t-body text-muted">
            Sàn trao đổi món đồ đã qua sử dụng giữa những người dùng thật.
          </p>
          <Link
            to="/support"
            className="inline-flex t-label text-brand hover:underline"
          >
            Trung tâm hỗ trợ
          </Link>
        </div>
        <div>
          <h2 className="t-label text-ink">Danh mục</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {roots.map((root) => (
              <li key={root.id}>
                <Link
                  to={`/products?category_id=${root.id}`}
                  className="t-body text-muted transition-colors hover:text-ink"
                >
                  {root.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
