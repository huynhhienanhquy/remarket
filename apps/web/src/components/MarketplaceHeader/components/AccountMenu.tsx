import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useSession } from "@/contexts/SessionContext";
import { ApiImage, ChevronRightIcon } from "@/components/common";

/* ------------------------------------------------------------------ */
/* Account menu                                                        */
/* ------------------------------------------------------------------ */
const MENU_ITEMS = [
  { to: "/account", label: "Hồ sơ" },
  { to: "/account/products", label: "Tin đăng của tôi" },
  { to: "/orders", label: "Đơn mua" },
  { to: "/sales", label: "Đơn bán" },
  { to: "/favorites", label: "Yêu thích" },
  { to: "/support", label: "Hỗ trợ" },
];

export function AccountMenu() {
  const { viewer, logout } = useSession();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!viewer) return null;

  const initials = viewer.full_name.trim().slice(0, 1).toUpperCase();

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate("/");
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Tài khoản của ${viewer!.full_name}`}
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 items-center gap-2 rounded-control px-1.5 transition-colors hover:bg-surface-subtle"
      >
        {viewer!.avatar_url ? (
          <ApiImage
            src={viewer!.avatar_url}
            alt=""
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid h-8 w-8 place-items-center rounded-full bg-brand-soft text-sm font-semibold text-brand"
          >
            {initials}
          </span>
        )}
        <span className="hidden max-w-[120px] truncate t-label text-ink xl:inline">
          {viewer!.full_name}
        </span>
        <ChevronRightIcon className="hidden rotate-90 text-muted xl:block" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+8px)] z-header w-56 rounded-card border border-line bg-surface p-1.5 shadow-pop"
        >
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-control px-3 py-2.5 t-body text-ink transition-colors hover:bg-surface-subtle"
            >
              {item.label}
            </Link>
          ))}
          {viewer!.role === "ADMIN" && (
            <Link
              to="/admin"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-control px-3 py-2.5 t-body text-ink transition-colors hover:bg-surface-subtle"
            >
              Trang quản trị
            </Link>
          )}
          <div className="my-1 border-t border-line" />
          <button
            type="button"
            role="menuitem"
            onClick={handleLogout}
            className="block w-full rounded-control px-3 py-2.5 text-left t-body text-danger transition-colors hover:bg-danger-bg"
          >
            Đăng xuất
          </button>
        </div>
      )}
    </div>
  );
}
