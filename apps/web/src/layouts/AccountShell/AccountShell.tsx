import { Suspense, useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link, matchPath, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../contexts/SessionContext";
import { ApiImage } from "../../components/common/ApiImage/ApiImage";
import { Icon } from "../../components/common/Icon/Icon";
import { ACCOUNT_ITEMS } from "../../config/route/accountNavigation";
import { MarketplaceHeader } from "../../components/MarketplaceHeader/MarketplaceHeader";
import { MobileBottomNav } from "../../components/MobileBottomNav/MobileBottomNav";
import { AccountLinks } from "../../components/AccountLinks/AccountLinks";
import { MobileHeaderActions } from "../../components/MarketplaceHeader/components/MobileHeaderActions";
import { ListLoading } from "../../components/common/PageFeedback/PageFeedback";
import { AdminChatPanel } from "../ChatShell/ChatShell";

function Sidebar() {
  const { viewer } = useSession();
  return <nav aria-label="Tài khoản" className="rm-account-card hidden max-h-full w-[240px] shrink-0 overflow-y-auto overscroll-contain p-3 lg:block">
    <div className="mb-5 flex items-center gap-3 border-b border-line px-2 pb-5 pt-2">
      {viewer?.avatar_url ? <ApiImage src={viewer.avatar_url} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" /> : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-lg font-semibold text-brand">{viewer?.full_name.slice(0, 1)}</span>}
      <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{viewer?.full_name}</p><p className="mt-1 truncate text-xs text-muted">Tài khoản của bạn</p></div>
    </div>
    <AccountLinks />
  </nav>;
}

export function AccountShell() {
  const { pathname, search: locationSearch } = useLocation();
  const navigate = useNavigate();
  const { viewer } = useSession();
  const [search, setSearch] = useState("");
  const content = useRef<HTMLElement>(null);
  const isIndex = pathname === "/account";
  const messages = matchPath("/messages/:id?", pathname) !== null;
  const isConversation = matchPath("/messages/:id", pathname) !== null;
  const adminConversation = isConversation && viewer?.role === "ADMIN";
  const childTitle = messages ? "Tin nhắn" : ACCOUNT_ITEMS.find((item) => item.to === pathname)?.label;
  const mainLayout = messages
    ? `h-full overflow-hidden lg:rounded-card lg:border lg:border-slate-200 ${isConversation ? "" : "pb-[calc(theme(spacing.mobile-nav)+env(safe-area-inset-bottom))] lg:pb-0"}`
    : "rm-account-page pb-[calc(80px+env(safe-area-inset-bottom))] lg:h-full lg:overflow-y-auto lg:overscroll-contain lg:pb-0";
  const submitSearch = useCallback(() => {
    const value = search.trim();
    navigate(value ? `/products?q=${encodeURIComponent(value)}` : "/products");
  }, [navigate, search]);
  useLayoutEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [pathname]);

  const page = (
    <Suspense fallback={<div className="p-4"><ListLoading /></div>}>
      <Outlet />
    </Suspense>
  );

  return <div className={`flex flex-col lg:h-dvh lg:overflow-hidden ${messages ? "h-dvh" : "min-h-screen lg:min-h-0"}`}>
    <div className={`${childTitle && !isIndex ? "hidden lg:block " : ""}sticky top-0 z-header shrink-0`}>
      <MarketplaceHeader search={search} onSearchChange={setSearch} onSearchSubmit={submitSearch} categories={[]} showSearchRow={false} showCategories={false} />
    </div>
    {childTitle && !isIndex && !adminConversation && <header className="sticky top-0 z-header shrink-0 border-b border-line bg-surface lg:hidden">
      <div className="rm-container flex h-mobile-header items-center gap-2">
        <Link to={isConversation ? `/messages${locationSearch}` : "/account"} aria-label="Quay lại" className="rm-control -ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-ink hover:bg-surface-subtle"><Icon name="chevron-left" /></Link>
        <p className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{childTitle}</p>
        <MobileHeaderActions />
      </div>
    </header>}
    <div className={`rm-container flex min-h-0 flex-1 items-start gap-8 lg:px-8 lg:py-6 ${messages ? "px-0 sm:px-0" : "py-6"}`}>
      <Sidebar />
      <main ref={content} className={`min-h-0 min-w-0 flex-1 ${mainLayout}`}>
        {adminConversation ? <AdminChatPanel>{page}</AdminChatPanel> : page}
        {isIndex && <nav aria-label="Tài khoản" className="rm-account-card mt-6 p-3 lg:hidden"><AccountLinks /></nav>}
      </main>
    </div>
    {!isConversation && <MobileBottomNav />}
  </div>;
}
