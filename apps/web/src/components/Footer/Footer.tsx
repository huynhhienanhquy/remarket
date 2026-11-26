import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../../contexts/SessionContext";
import type { CategoryNode } from "@remarket/shared";
import { apiForQuery } from "../../services/api";
import { queryKeys } from "../../config/queryClient";
import { Logo } from "../Logo/Logo";

/**
 * Marketing footer: discovery and public profiles only (ui-spec 3). No policy
 * links are rendered until real content and routes exist.
 */
export function Footer({ deferCategories = false }: { deferCategories?: boolean }) {
  const { status } = useSession();
  const footer = useRef<HTMLElement>(null);
  const [categoriesVisible, setCategoriesVisible] = useState(false);
  useEffect(() => {
    const element = footer.current;
    if (!deferCategories || !element || categoriesVisible || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setCategoriesVisible(true);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [categoriesVisible, deferCategories]);

  const { data: categories } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: ({ signal }) => apiForQuery(signal).categories.tree(),
    enabled: status === "ready" && (!deferCategories || categoriesVisible || typeof IntersectionObserver === "undefined"),
    staleTime: 5 * 60_000,
  });
  const roots: CategoryNode[] = (categories ?? []).filter(
    (entry) => entry.status === "ACTIVE",
  );

  return (
    <footer ref={footer} className="border-t border-line bg-surface pb-[calc(64px+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="rm-container grid gap-8 py-10 lg:grid-cols-[1fr_2fr] lg:py-12">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-xs t-body text-muted">
            Sàn trao đổi món đồ đã qua sử dụng giữa những người dùng thật.
          </p>
          <Link
            to="/support"
            className="inline-flex min-h-touch items-center text-sm font-semibold text-brand hover:underline"
          >
            Trung tâm hỗ trợ
          </Link>
        </div>
        {roots.length > 0 && <div>
          <h2 className="text-sm font-semibold text-ink">Danh mục</h2>
          <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
            {roots.map((root) => (
              <li key={root.id}>
                <Link
                  to={`/products?category_id=${root.id}`}
                  className="inline-flex min-h-touch items-center text-sm text-muted transition-colors hover:text-brand"
                >
                  {root.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>}
      </div>
    </footer>
  );
}
