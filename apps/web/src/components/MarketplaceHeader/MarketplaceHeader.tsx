import { IconButton } from "./components/HeaderIconLink";
import { CategoryBar } from "./components/CategoryBar";
import { AccountMenu } from "./components/AccountMenu";
import { MobileHeaderActions } from "./components/MobileHeaderActions";
import { useUnreadCounts } from "../../hooks/useUnreadCounts";
import { Link, useLocation } from "react-router-dom";
import type { CategoryNode } from "@remarket/shared";
import { useSession } from "../../contexts/SessionContext";
import { loginPathFor } from "../../config/route/guards";
import { BellIcon, CartIcon, ChatIcon, PlusIcon } from "../common/Icon/Icon";
import { SearchInput } from "../common/SearchInput/SearchInput";
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
  const sellTarget = viewer ? "/account/products/new" : loginPathFor("/account/products/new", "");
  const cartTarget = viewer ? "/cart" : loginPathFor("/cart", "");

  return (
    <header className="sticky top-0 z-header bg-surface">
      {/* Desktop header: 80px */}
      <div className="hidden border-b border-line lg:block">
        <div className="rm-container flex h-20 items-center gap-6">
          <div className="w-40 shrink-0">
            <Logo />
          </div>
          <div className="min-w-0 max-w-[580px] flex-1">
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
                className="rm-control flex h-11 items-center rounded-control px-3 t-label text-ink hover:bg-surface-subtle"
              >
                Đăng nhập
              </Link>
            )}

            <Link
              to={sellTarget}
              className="rm-control rm-button-primary ml-2 flex h-11 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white"
            >
              <span className="rm-button-content inline-flex items-center gap-2">
                <PlusIcon size={17} />
                Đăng bán
              </span>
            </Link>
          </nav>
        </div>
      </div>

      {showCategories && <CategoryBar categories={categories} />}

      {/* Mobile header: 56px logo row (+ 48px search row on discovery) */}
      <div className="border-b border-line lg:hidden">
        <div className="rm-container flex h-mobile-header items-center gap-3">
          <Logo />
          <MobileHeaderActions />
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
