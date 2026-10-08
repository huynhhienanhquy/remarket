import { useCallback, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../SessionProvider";
import { CompactHeader, MarketplaceHeader } from "./MarketplaceHeader";
import { MobileBottomNav } from "./MobileBottomNav";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}

const GROUPS: { title: string; items: NavItem[] }[] = [
  { title: "Tài khoản", items: [{ to: "/account", label: "Hồ sơ cá nhân", end: true }] },
  {
    title: "Mua sắm",
    items: [
      { to: "/favorites", label: "Yêu thích" },
      { to: "/cart", label: "Giỏ hàng" },
      { to: "/orders", label: "Đơn mua" },
    ],
  },
  {
    title: "Bán hàng",
    items: [
      { to: "/account/products", label: "Tin đăng của tôi" },
      { to: "/sales", label: "Đơn bán" },
    ],
  },
  {
    title: "Giao tiếp",
    items: [
      { to: "/messages", label: "Tin nhắn" },
      { to: "/notifications", label: "Thông báo" },
      { to: "/support", label: "Hỗ trợ" },
    ],
  },
];

function Sidebar() {
  return (
    <nav aria-label="Tài khoản" className="hidden w-[220px] shrink-0 lg:block">
      <div className="sticky top-[104px] space-y-6">
        {GROUPS.map((group) => (
          <div key={group.title}>
            <h2 className="t-meta text-muted">{group.title}</h2>
            <ul className="mt-2 space-y-1">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      [
                        "block rounded-control px-3 py-2 t-body transition-colors",
                        isActive
                          ? "bg-brand-soft font-semibold text-brand"
                          : "text-ink hover:bg-surface-subtle",
                      ].join(" ")
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}

/** Compact mobile titles for each account sub-page (ui-spec 3.2). */
const TITLES: Record<string, string> = {
  "/account/products": "Tin đăng của tôi",
  "/favorites": "Yêu thích",
  "/cart": "Giỏ hàng",
  "/orders": "Đơn mua",
  "/sales": "Đơn bán",
  "/notifications": "Thông báo",
  "/support": "Hỗ trợ",
};

/**
 * AccountShell: marketplace header + 220px sidebar (ui-spec 3.2). On mobile
 * the sidebar collapses into the menu list on /account; child pages get a
 * compact "Quay lại + tiêu đề" header instead.
 */
export function AccountShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { viewer } = useSession();
  const [search, setSearch] = useState("");

  const isIndex = location.pathname === "/account";
  const childTitle = TITLES[location.pathname];

  const submitSearch = useCallback(() => {
    const value = search.trim();
    navigate(value ? `/products?q=${encodeURIComponent(value)}` : "/products");
  }, [navigate, search]);

  return (
    <div className="flex min-h-screen flex-col">
      <MarketplaceHeader
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={submitSearch}
        categories={[]}
        showSearchRow={false}
      />
      {childTitle && <CompactHeader title={childTitle} backTo="/account" />}
      <main className="flex-1">
        <div className="rm-container flex gap-8 py-6 lg:py-8">
          <Sidebar />
          <div className="min-w-0 flex-1">
            {isIndex ? (
              <>
                <div className="mb-6">
                  <p className="mt-1 t-body text-muted">
                    Chào {viewer?.full_name ?? ""}, quản lý hồ sơ và giao dịch của bạn.
                  </p>
                </div>
                <Outlet />
                {/* Profile stays visible before the mobile navigation menu. */}
                <nav aria-label="Tài khoản" className="mt-8 space-y-6 lg:hidden">
                  {GROUPS.map((group) => (
                    <div key={group.title}>
                      <h2 className="t-meta text-muted">{group.title}</h2>
                      <ul className="mt-2 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                        {group.items.map((item) => (
                          <li key={item.to}>
                            <Link
                              to={item.to}
                              className="flex min-h-[48px] items-center justify-between px-4 t-body text-ink"
                            >
                              {item.label}
                              <span aria-hidden="true" className="text-muted">
                                ›
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </nav>
              </>
            ) : null}
            {!isIndex && <Outlet />}
          </div>
        </div>
      </main>
      <MobileBottomNav />
    </div>
  );
}
