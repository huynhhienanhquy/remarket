import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../../contexts/SessionContext";
import { ChevronLeftIcon } from "../../components/common";
import { adminChatReturnPath } from "../../utils/chatNavigation";
import { AccountShell } from "../AccountShell/AccountShell";

/**
 * Member inbox and conversations share the account layout. Admin conversation
 * detail keeps its compact header and return to the originating admin page.
 */
export function ChatShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { viewer } = useSession();
  const isDetail = /^\/messages\/[^/]+$/.test(location.pathname);
  const admin = viewer?.role === "ADMIN";
  const returnTo = adminChatReturnPath(new URLSearchParams(location.search).get("return_to")) ?? "/admin/users";

  if (!admin || !isDetail) return <AccountShell />;

  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="sticky top-0 z-header border-b border-line bg-surface">
        <div className="rm-container flex h-14 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(returnTo, { replace: true })}
            className="-ml-2 flex h-11 items-center gap-1 rounded-control px-2 t-label text-ink transition-colors hover:bg-surface-subtle"
          >
            <ChevronLeftIcon />
            Quay lại quản trị
          </button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
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
