import { useCallback, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../contexts/SessionContext";
import { ApiImage, Drawer, Icon } from "../../components/common";
import { ACCOUNT_GROUPS, ACCOUNT_ITEMS } from "../../config/route/accountNavigation";
import { MarketplaceHeader } from "../../components/MarketplaceHeader/MarketplaceHeader";
import { MobileBottomNav } from "../../components/MobileBottomNav/MobileBottomNav";

function AccountLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <div className="space-y-5">
    {ACCOUNT_GROUPS.map((group) => <div key={group.title}>
      <h2 className="px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{group.title}</h2>
      <ul className="mt-2 space-y-1">
        {group.items.map((item) => <li key={item.to}>
          <NavLink to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => [
            "group flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm leading-5 transition-colors",
            isActive ? "bg-brand font-semibold text-white" : "font-medium text-muted hover:bg-surface-subtle hover:text-ink",
          ].join(" ")}>
            <Icon name={item.icon} className="shrink-0" />
            <span className="flex-1">{item.label}</span>
            <Icon name="chevron-right" size={16} className="shrink-0 opacity-50" />
          </NavLink>
        </li>)}
      </ul>
    </div>)}
  </div>;
}

function Sidebar() {
  const { viewer } = useSession();
  return <nav aria-label="Tài khoản" className="rm-account-card sticky top-[104px] hidden max-h-[calc(100dvh-128px)] w-[240px] shrink-0 self-start overflow-y-auto p-3 lg:block">
    <div className="mb-5 flex items-center gap-3 border-b border-line px-2 pb-5 pt-2">
      {viewer?.avatar_url ? <ApiImage src={viewer.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg font-semibold text-brand">{viewer?.full_name.slice(0, 1)}</span>}
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{viewer?.full_name}</p><p className="mt-1 truncate text-xs text-muted">Tài khoản của bạn</p></div>
    </div>
    <AccountLinks />
  </nav>;
}

export function AccountShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const isIndex = location.pathname === "/account";
  const childTitle = ACCOUNT_ITEMS.find((item) => item.to === location.pathname)?.label;
  const submitSearch = useCallback(() => {
    const value = search.trim();
    navigate(value ? `/products?q=${encodeURIComponent(value)}` : "/products");
  }, [navigate, search]);

  return <div className="flex min-h-screen flex-col">
    <div className={`${childTitle && !isIndex ? "hidden lg:block " : ""}sticky top-0 z-header`}>
      <MarketplaceHeader search={search} onSearchChange={setSearch} onSearchSubmit={submitSearch} categories={[]} showSearchRow={false} showCategories={false} />
    </div>
    {childTitle && !isIndex && <header className="sticky top-0 z-header border-b border-line bg-surface lg:hidden">
      <div className="rm-container flex h-14 items-center gap-2">
        <Link to="/account" aria-label="Quay lại" className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink hover:bg-surface-subtle"><Icon name="chevron-left" /></Link>
        <p className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{childTitle}</p>
        <button type="button" aria-label="Mở menu tài khoản" onClick={() => setMenuOpen(true)} className="grid h-11 w-11 place-items-center rounded-xl border border-line text-ink hover:bg-surface-subtle"><Icon name="menu" /></button>
      </div>
    </header>}
    <main className="rm-account-page flex-1 pb-[calc(80px+env(safe-area-inset-bottom))] lg:pb-0">
      <div className="rm-container flex items-start gap-8 py-6 lg:py-8">
        <Sidebar />
        <div className="min-w-0 flex-1">
          {isIndex && <nav aria-label="Truy cập nhanh tài khoản" className="rm-account-card mb-6 p-4 lg:hidden">
            <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold text-ink">Không gian của bạn</p><p className="mt-1 text-xs text-muted">Mua sắm, bán hàng và kết nối.</p></div><button type="button" aria-label="Mở menu tài khoản" onClick={() => setMenuOpen(true)} className="flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-soft px-3 text-sm font-semibold text-brand"><Icon name="menu" />Menu</button></div>
          </nav>}
          <Outlet />
          {isIndex && <nav aria-label="Tài khoản" className="rm-account-card mt-6 p-3 lg:hidden"><AccountLinks /></nav>}
        </div>
      </div>
    </main>
    <MobileBottomNav />
    <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Tài khoản của bạn">
      <nav aria-label="Menu tài khoản"><AccountLinks onNavigate={() => setMenuOpen(false)} /></nav>
    </Drawer>
  </div>;
}
