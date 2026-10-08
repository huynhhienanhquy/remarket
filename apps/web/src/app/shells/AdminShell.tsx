import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSession } from "../SessionProvider";
import { Logo } from "./Logo";
import { MenuIcon, XIcon, useToast } from "../../components/ui";
import { errorTitle } from "../../lib/errors";

const NAV = [
  { to: "/admin", label: "Tổng quan", end: true },
  { to: "/admin/users", label: "Người dùng" },
  { to: "/admin/products", label: "Sản phẩm" },
  { to: "/admin/categories", label: "Danh mục" },
  { to: "/admin/reports", label: "Báo cáo" },
  { to: "/admin/reviews", label: "Đánh giá" },
  { to: "/admin/support", label: "Hỗ trợ" },
  { to: "/admin/audit", label: "Nhật ký" },
];

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const { logout } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await logout();
      navigate("/");
    } catch (error) {
      toast.error("Chưa thể đăng xuất", { description: errorTitle(error) });
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-line px-4">
        <Logo to="/admin" />
        <span className="ml-3 rounded-full bg-brand-soft px-2 py-0.5 t-meta font-semibold text-brand">
          Quản trị
        </span>
      </div>
      <nav aria-label="Khu vực quản trị" className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                "block rounded-control px-3 py-2.5 t-body transition-colors",
                isActive
                  ? "bg-brand-soft font-semibold text-brand"
                  : "text-ink hover:bg-surface-subtle",
              ].join(" ")
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="space-y-1 border-t border-line p-3">
        <Link
          to="/"
          onClick={onNavigate}
          className="block rounded-control px-3 py-2.5 t-body text-ink transition-colors hover:bg-surface-subtle"
        >
          Về marketplace
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-busy={loggingOut}
          className="block w-full rounded-control px-3 py-2.5 text-left t-body text-danger transition-colors hover:bg-danger-bg"
        >
          {loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}
        </button>
      </div>
    </div>
  );
}

/**
 * AdminShell: fixed 240px sidebar, 64px header, 24px main padding (ui-spec 3.4).
 * Below lg the sidebar becomes a drawer; the header always names the admin
 * area so it can never be mistaken for a shopping account.
 */
export function AdminShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="min-h-screen bg-page">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-header hidden w-60 border-r border-line bg-surface lg:block">
        <AdminNav />
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-dialog lg:hidden">
          <div
            className="absolute inset-0 bg-ink/40"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Menu quản trị"
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-pop"
          >
            <button
              type="button"
              aria-label="Đóng menu"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-2 top-3 flex h-11 w-11 items-center justify-center rounded-control text-muted hover:bg-surface-subtle"
            >
              <XIcon />
            </button>
            <AdminNav onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-section flex h-16 items-center gap-3 border-b border-line bg-surface px-4 lg:px-6">
          <button
            type="button"
            aria-label="Mở menu quản trị"
            onClick={() => setDrawerOpen(true)}
            className="flex h-11 w-11 items-center justify-center rounded-control text-ink hover:bg-surface-subtle lg:hidden"
          >
            <MenuIcon />
          </button>
          <h1 className="t-h3 text-ink">Trang quản trị</h1>
          <span className="hidden t-meta text-muted sm:inline">
            Khu vực dành cho quản trị viên ReMarket
          </span>
        </header>
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
