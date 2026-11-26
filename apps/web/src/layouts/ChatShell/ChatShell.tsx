import type { ReactNode } from "react";
import { Link, Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeftIcon } from "../../components/common/Icon/Icon";
import { adminChatReturnPath } from "../../utils/chatNavigation";
import { checkoutBackLink } from "../../utils/checkoutNavigation";

/** Admin conversations can return to the original user selection and filters. */
export function AdminChatPanel({ children }: { children: ReactNode }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const returnTo = adminChatReturnPath(params.get("return_to")) ?? "/admin/users";

  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-line bg-surface">
        <div className="flex h-14 items-center px-4">
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
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

/** Compact "Đặt hàng" header for the checkout flow (ui-spec 16). */
export function CheckoutShell() {
  const [params] = useSearchParams();
  const back = checkoutBackLink(params.get("product_id"));
  return (
    <div className="flex min-h-screen flex-col bg-page">
      <header className="sticky top-0 z-header border-b border-line bg-surface">
        <div className="rm-container flex h-14 items-center gap-3 lg:h-20">
          <Link
            to={back.to}
            className="-ml-2 flex h-11 items-center gap-1 rounded-control px-2 t-label text-ink transition-colors hover:bg-surface-subtle"
          >
            <ChevronLeftIcon />
            {back.label}
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
