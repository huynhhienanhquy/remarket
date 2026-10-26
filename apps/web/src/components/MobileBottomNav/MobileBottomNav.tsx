import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
import { Drawer, HeartIcon, HomeIcon, Icon, MenuIcon, PlusIcon, UserIcon } from "../common";
import { useSession } from "../../contexts/SessionContext";
import { loginPathFor } from "../../config/route/guards";
import { AccountLinks } from "../AccountLinks/AccountLinks";

interface Tab {
  to: string;
  label: string;
  icon: (props: { className?: string }) => React.ReactElement;
  match: (pathname: string) => boolean;
  authOnly?: boolean;
}

const TABS: Tab[] = [
  { to: "/", label: "Khám phá", icon: HomeIcon, match: (p) => p === "/" || p === "/products" || p.startsWith("/users/") },
  { to: "/favorites", label: "Yêu thích", icon: HeartIcon, match: (p) => p.startsWith("/favorites"), authOnly: true },
  { to: "/account/products/new", label: "Đăng bán", icon: PlusIcon, match: (p) => p.startsWith("/account/products/new") },
  { to: "/account", label: "Tài khoản", icon: UserIcon, match: (p) => ["/account", "/cart", "/orders", "/sales", "/notifications", "/support"].some((prefix) => p === prefix || p.startsWith(`${prefix}/`)), authOnly: true },
];

/**
 * Bottom navigation for discovery pages (ui-spec 3). Hidden on product detail,
 * checkout, listing form, chat detail and order detail, which carry their own
 * action bar or composer.
 */
export function MobileBottomNav() {
  const location = useLocation();
  const { viewer } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = location.pathname;

  const hidden =
    /^\/products\/[^/]+$/.test(pathname) ||
    pathname === "/checkout" ||
    /^\/account\/products\/(new|[^/]+\/edit)$/.test(pathname) ||
    /^\/messages\/[^/]+$/.test(pathname) ||
    /^\/(orders|sales)\/[^/]+$/.test(pathname);

  if (hidden) return null;

  const tabs = TABS.map((tab) => {
    if (!tab.authOnly || viewer) return tab;
    // Guests: protected tabs route to login with a safe return target.
    return { ...tab, to: loginPathFor(pathname, location.search) };
  });

  return (
    <><nav
      aria-label="Điều hướng chính"
      className="rm-safe-bottom fixed inset-x-0 bottom-0 z-action-bar border-t border-line bg-surface lg:hidden"
    >
      <ul className="rm-container flex h-16 items-stretch justify-between">
        {tabs.map((tab) => {
          const active = tab.match(pathname) && (tab.authOnly !== true || viewer !== null);
          const Icon = tab.icon;
          return (
            <li key={tab.label} className="flex-1">
              <Link
                to={tab.to}
                aria-current={active ? "page" : undefined}
                className={[
                  "flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-control py-1",
                  active ? "bg-brand-soft text-brand" : "text-muted",
                ].join(" ")}
              >
                <Icon className={active ? "text-brand" : "text-muted"} />
                <span
                  className={[
                    "text-[11px] leading-[14px]",
                    active ? "font-semibold text-brand" : "text-muted",
                  ].join(" ")}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button type="button" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className={`flex h-full min-h-[44px] w-full flex-col items-center justify-center gap-0.5 rounded-control py-1 ${menuOpen ? "bg-brand-soft text-brand" : "text-muted"}`}>
            <MenuIcon />
            <span className={`text-[11px] leading-[14px] ${menuOpen ? "font-semibold" : ""}`}>Menu</span>
          </button>
        </li>
      </ul>
    </nav>
    <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
      <nav aria-label="Menu điều hướng" className="space-y-5">
        <Link to="/products" onClick={() => setMenuOpen(false)} className="flex min-h-[44px] items-center gap-3 rounded-xl bg-brand-soft px-3 py-2.5 text-sm font-semibold text-brand"><HomeIcon />Khám phá sản phẩm</Link>
        {viewer ? <>
          <AccountLinks onNavigate={() => setMenuOpen(false)} />
          {viewer.role === "ADMIN" && <Link to="/admin" onClick={() => setMenuOpen(false)} className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface-subtle"><Icon name="inbox" />Trang quản trị</Link>}
        </> : <div className="space-y-2">
          <p className="px-3 text-sm text-muted">Đăng nhập để quản lý tài khoản, tin đăng và đơn hàng.</p>
          <Link to={loginPathFor(pathname, location.search)} onClick={() => setMenuOpen(false)} className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-brand"><UserIcon />Đăng nhập</Link>
          <Link to="/register" onClick={() => setMenuOpen(false)} className="flex min-h-[44px] items-center rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-surface-subtle">Tạo tài khoản</Link>
        </div>}
      </nav>
    </Drawer></>
  );
}
