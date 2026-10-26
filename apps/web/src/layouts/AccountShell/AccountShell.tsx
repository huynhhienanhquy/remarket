import { useCallback, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../contexts/SessionContext";
import { ApiImage, Icon } from "../../components/common";
import { ACCOUNT_ITEMS } from "../../config/route/accountNavigation";
import { MarketplaceHeader } from "../../components/MarketplaceHeader/MarketplaceHeader";
import { MobileBottomNav } from "../../components/MobileBottomNav/MobileBottomNav";
import { AccountLinks } from "../../components/AccountLinks/AccountLinks";
import { MobileHeaderActions } from "../../components/MarketplaceHeader/components/MobileHeaderActions";

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
  const isIndex = location.pathname === "/account";
  const isConversation = /^\/messages\/[^/]+\/?$/.test(location.pathname);
  const childTitle = isConversation ? "Tin nhắn" : ACCOUNT_ITEMS.find((item) => item.to === location.pathname)?.label;
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
        <Link to={isConversation ? `/messages${location.search}` : "/account"} aria-label="Quay lại" className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink hover:bg-surface-subtle"><Icon name="chevron-left" /></Link>
        <p className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{childTitle}</p>
        <MobileHeaderActions />
      </div>
    </header>}
    <main className={`rm-account-page flex-1 ${isConversation ? "" : "pb-[calc(80px+env(safe-area-inset-bottom))]"} lg:pb-0`}>
      <div className={`rm-container flex items-start gap-8 ${isConversation ? "px-0 sm:px-0 lg:px-8 lg:py-8" : "py-6 lg:py-8"}`}>
        <Sidebar />
        <div className="min-w-0 flex-1">
          <Outlet />
          {isIndex && <nav aria-label="Tài khoản" className="rm-account-card mt-6 p-3 lg:hidden"><AccountLinks /></nav>}
        </div>
      </div>
    </main>
    {!isConversation && <MobileBottomNav />}
  </div>;
}
