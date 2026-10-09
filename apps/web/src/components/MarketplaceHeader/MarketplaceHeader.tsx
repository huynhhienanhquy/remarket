import { IconButton } from "./components/HeaderIconLink";
import { CategoryBar } from "./components/CategoryBar";
import { AccountMenu } from "./components/AccountMenu";
import { useUnreadCounts } from "../../hooks/useUnreadCounts";
import { Link, useLocation } from "react-router-dom";
import type { CategoryNode } from "@remarket/shared";
import { useSession } from "../../contexts/SessionContext";
import { loginPathFor } from "../../config/route/guards";
import { BellIcon, CartIcon, ChatIcon, ChevronLeftIcon, SearchInput, UserIcon } from "../common";
import { Logo } from "../Logo/Logo";

export function MarketplaceHeader({
  search,
  onSearchChange,
  onSearchSubmit,
  categories,
  showSearchRow,
  showCategories = true,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  categories: CategoryNode[];
  /** Mobile second row with search: only on discovery pages (ui-spec 3). */
  showSearchRow: boolean;
  showCategories?: boolean;
}) {
  const { viewer } = useSession();
  const location = useLocation();
  const { messages, notifications, cart } = useUnreadCounts(viewer !== null);
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
                <IconButton to="/messages" label="Tin nhắn" badge={messages}>
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

      {showCategories && <CategoryBar categories={categories} />}

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
                  to="/account"
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
