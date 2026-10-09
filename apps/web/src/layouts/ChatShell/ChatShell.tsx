import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../contexts/SessionContext";
import { ChevronLeftIcon } from "../../components/common";
import { Logo } from "../../components/Logo/Logo";
import { MobileBottomNav } from "../../components/MobileBottomNav/MobileBottomNav";

/**
 * ChatShell (ui-spec 20): compact header, no footer, no bottom navigation on
 * the conversation view — the composer owns the bottom of the screen.
 */
export function ChatShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { viewer } = useSession();
  const isDetail = /^\/messages\/[^/]+$/.test(location.pathname);

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="sticky top-0 z-header border-b border-line bg-surface">
        <div className="rm-container flex h-14 items-center gap-3">
          {isDetail ? (
            <button
              type="button"
              onClick={() => navigate("/messages")}
              className="-ml-2 flex h-11 items-center gap-1 rounded-control px-2 t-label text-ink transition-colors hover:bg-surface-subtle"
            >
              <ChevronLeftIcon />
              Quay lại
            </button>
          ) : (
            <>
              <Logo to={viewer ? "/messages" : "/"} />
              <h1 className="t-h3 text-ink">Tin nhắn</h1>
            </>
          )}
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      {!isDetail && <MobileBottomNav />}
    </div>
  );
}

/** Compact "Đặt hàng" header for the checkout flow (ui-spec 16). */
export function CheckoutShell() {
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="sticky top-0 z-header border-b border-line bg-surface">
        <div className="rm-container flex h-14 items-center gap-3 lg:h-20">
          <Link
            to="/cart"
            className="-ml-2 flex h-11 items-center gap-1 rounded-control px-2 t-label text-ink transition-colors hover:bg-surface-subtle"
          >
            <ChevronLeftIcon />
            Quay lại giỏ hàng
          </Link>
          <h1 className="t-h3 text-ink">Đặt hàng</h1>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
