import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CategoryNode } from "@remarket/shared";
import { ChevronRightIcon } from "@/components/common";

/* ------------------------------------------------------------------ */
/* Category navigation                                                 */
/* ------------------------------------------------------------------ */
export function CategoryBar({ categories }: { categories: CategoryNode[] }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const roots = categories.filter((entry) => entry.status === "ACTIVE");

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function go(categoryId?: string) {
    setOpen(false);
    navigate(categoryId ? `/products?category_id=${categoryId}` : "/products");
  }

  return (
    <nav aria-label="Danh mục sản phẩm" className="hidden border-b border-line bg-surface lg:block">
      <div className="rm-container flex h-11 items-center gap-1">
        <div ref={containerRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex h-11 items-center gap-1.5 rounded-control px-3 t-label text-ink transition-colors hover:bg-surface-subtle"
          >
            Tất cả danh mục
            <ChevronRightIcon className="rotate-90 text-muted" />
          </button>
          {open && (
            <div
              role="menu"
              className="absolute left-0 top-full z-header max-h-[70vh] w-72 overflow-y-auto rounded-card border border-line bg-surface p-1.5 shadow-pop"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => go()}
                className="block w-full rounded-control px-3 py-2.5 text-left t-body font-semibold text-ink hover:bg-surface-subtle"
              >
                Tất cả sản phẩm
              </button>
              {/* Two levels maximum (ui-spec 3.1). */}
              {roots.map((root) => (
                <div key={root.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => go(root.id)}
                    className="block w-full rounded-control px-3 py-2.5 text-left t-body text-ink hover:bg-surface-subtle"
                  >
                    {root.name}
                  </button>
                  {(root.children ?? [])
                    .filter((child) => child.status === "ACTIVE")
                    .map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        role="menuitem"
                        onClick={() => go(child.id)}
                        className="block w-full rounded-control py-2 pl-7 pr-3 text-left t-body text-muted hover:bg-surface-subtle hover:text-ink"
                      >
                        {child.name}
                      </button>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <ul className="flex min-w-0 items-center gap-1 overflow-hidden">
          {roots.slice(0, 6).map((root) => (
            <li key={root.id}>
              <Link
                to={`/products?category_id=${root.id}`}
                className="flex h-11 items-center rounded-control px-3 t-label text-muted transition-colors hover:bg-surface-subtle hover:text-ink"
              >
                {root.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
