import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { CategoryNode } from "@remarket/shared";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queryClient";
import { useSession } from "../SessionProvider";
import { loginPathFor } from "../guards";
import {
  BellIcon,
  CartIcon,
  ChatIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  SearchInput,
  UserIcon,
} from "../../components/ui";
import { Logo } from "./Logo";

/* ------------------------------------------------------------------ */
/* Unread badges                                                       */
/* ------------------------------------------------------------------ */

/** Caps at "99+"; only real numbers are ever rendered (ui-spec 3.1). */
function Badge({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${label}: ${count} chưa đọc`}
      className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-[18px] text-white"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function useUnreadCounts(enabled: boolean) {
  const notifications = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => api.notifications.unreadCount(),
    enabled,
    staleTime: 15_000,
  });
  const cart = useQuery({
    queryKey: queryKeys.cart,
    queryFn: () => api.cart.get(),
    enabled,
    staleTime: 15_000,
  });
  return {
    notifications: notifications.data ?? 0,
    cart: cart.data?.total_items ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Account menu                                                        */
/* ------------------------------------------------------------------ */

const MENU_ITEMS = [
  { to: "/account", label: "Hồ sơ" },
  { to: "/account/products", label: "Tin đăng của tôi" },
  { to: "/orders", label: "Đơn mua" },
  { to: "/sales", label: "Đơn bán" },
  { to: "/favorites", label: "Yêu thích" },
  { to: "/support", label: "Hỗ trợ" },
];

function AccountMenu() {
  const { viewer, logout } = useSession();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

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

  if (!viewer) return null;

  const initials = viewer.full_name.trim().slice(0, 1).toUpperCase();

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate("/");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản của ${viewer!.full_name}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 items-center gap-2 rounded-control px-1.5 transition-colors hover:bg-surface-subtle"
      >
        {viewer!.avatar_url ? (
          <img
            src={viewer!.avatar_url}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
          >
            {initials}
          </span>
        )}
        <span className="hidden max-w-[120px] truncate t-label text-ink xl:inline">
          {viewer!.full_name}
        </span>
        <ChevronRightIcon className="hidden rotate-90 text-muted xl:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-header w-56 rounded-card border border-line bg-surface p-1.5 shadow-pop"
        >
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-control px-3 py-2.5 t-body text-ink transition-colors hover:bg-surface-subtle"
            >
              {item.label}
            </Link>
          ))}
          {viewer!.role === "ADMIN" && (
            <Link
              to="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-control px-3 py-2.5 t-body text-ink transition-colors hover:bg-surface-subtle"
            >
              Trang quản trị
            </Link>
          )}
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="block w-full rounded-control px-3 py-2.5 text-left t-body text-danger transition-colors hover:bg-danger-bg"
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Category navigation                                                 */
/* ------------------------------------------------------------------ */

function CategoryBar({ categories }: { categories: CategoryNode[] }) {
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

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

function IconButton({
  to,
  label,
  children,
  badge,
  visibleWhenGuest = false,
}: {
  to: string;
  label: string;
  children: React.ReactNode;
  badge?: number;
  visibleWhenGuest?: boolean;
}) {
  const { viewer } = useSession();
  if (!viewer && !visibleWhenGuest) return null;
  return (
    <Link
      to={to}
      aria-label={label}
      className="relative flex h-11 w-11 items-center justify-center rounded-control text-ink transition-colors hover:bg-surface-subtle"
    >
      {children}
      {badge !== undefined && <Badge count={badge} label={label} />}
    </Link>
  );
}

export function MarketplaceHeader({
  search,
  onSearchChange,
  onSearchSubmit,
  categories,
  showSearchRow,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  categories: CategoryNode[];
  /** Mobile second row with search: only on discovery pages (ui-spec 3). */
  showSearchRow: boolean;
}) {
  const { viewer } = useSession();
  const location = useLocation();
  const { notifications, cart } = useUnreadCounts(viewer !== null);
  const loginFor = loginPathFor(location.pathname, location.search);
  const sellTarget = viewer ? "/account/products/new" : loginFor;
  const cartTarget = viewer ? "/cart" : loginFor;

  return (
    <header className="sticky top-0 z-header bg-surface">
      {/* Desktop header: 80px */}
      <div className="hidden border-b border-line lg:block">
        <div className="rm-container flex h-20 items-center gap-6">
          <div className="w-40 shrink-0">
            <Logo />
          </div>
          <div className="max-w-[520px] flex-1">
            <SearchInput
              value={search}
              onValueChange={onSearchChange}
              onSubmit={onSearchSubmit}
              label="Tìm kiếm sản phẩm"
            />
          </div>

          <nav aria-label="Tiện ích" className="ml-auto flex items-center gap-1">
            {viewer ? (
              <>
                <IconButton to="/messages" label="Tin nhắn">
                  <ChatIcon />
                </IconButton>
                <IconButton to="/notifications" label="Thông báo" badge={notifications}>
                  <BellIcon />
                </IconButton>
              </>
            ) : null}
            <IconButton to={cartTarget} label="Giỏ hàng" badge={cart} visibleWhenGuest>
              <CartIcon />
            </IconButton>

            {viewer ? (
              <AccountMenu />
            ) : (
              <Link
                to={loginFor}
                className="flex h-11 items-center rounded-control px-3 t-label text-ink transition-colors hover:bg-surface-subtle"
              >
                Đăng nhập
              </Link>
            )}

            <Link
              to={sellTarget}
              className="ml-1 flex h-11 items-center rounded-control bg-brand px-4 t-label text-white transition-colors hover:bg-brand-hover"
            >
              Đăng bán
            </Link>
          </nav>
        </div>
      </div>

      <CategoryBar categories={categories} />

      {/* Mobile header: 56px logo row (+ 48px search row on discovery) */}
      <div className="border-b border-line lg:hidden">
        <div className="rm-container flex h-14 items-center gap-3">
          <Logo />
          <div className="ml-auto flex items-center gap-1">
            <IconButton to={cartTarget} label="Giỏ hàng" badge={cart} visibleWhenGuest>
              <CartIcon />
            </IconButton>
            {viewer && (
              <>
                <IconButton to="/notifications" label="Thông báo" badge={notifications}>
                  <BellIcon />
                </IconButton>
                <Link
                  to={loginPathFor(location.pathname, location.search)}
                  aria-label="Tài khoản"
                  className="flex h-11 w-11 items-center justify-center rounded-control text-ink transition-colors hover:bg-surface-subtle"
                >
                  <UserIcon />
                </Link>
              </>
            )}
          </div>
        </div>
        {showSearchRow && (
          <div className="rm-container pb-3">
            <SearchInput
              value={search}
              onValueChange={onSearchChange}
              onSubmit={onSearchSubmit}
              label="Tìm kiếm sản phẩm"
            />
          </div>
        )}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Compact header for deep task pages (mobile)                         */
/* ------------------------------------------------------------------ */

export function CompactHeader({ title, backTo }: { title: string; backTo: string }) {
  return (
    <header className="sticky top-0 z-header border-b border-line bg-surface lg:hidden">
      <div className="rm-container flex h-14 items-center gap-2">
        <Link
          to={backTo}
          aria-label="Quay lại"
          className="-ml-2 flex h-11 w-11 items-center justify-center rounded-control text-ink transition-colors hover:bg-surface-subtle"
        >
          <ChevronLeftIcon />
        </Link>
        <h1 className="min-w-0 flex-1 truncate t-h3 text-ink">{title}</h1>
      </div>
    </header>
  );
}
