import { useEffect, useState } from "react";
import { Link, matchPath, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AdminNavigationCounts } from "@remarket/shared";
import { useSession } from "../../contexts/SessionContext";
import { Drawer } from "../../components/common/Drawer/Drawer";
import { Icon } from "../../components/common/Icon/Icon";
import { useToast } from "../../components/common/Toast/Toast";
import { ADMIN_NAVIGATION } from "../../config/route/adminNavigation";
import { errorTitle } from "../../helpers/errors";
import { queryKeys } from "../../config/queryClient";
import { useNavigationCounts } from "../../hooks/useNavigationCounts";
import { apiForQuery } from "../../services/api";
import "./admin.css";

const NAV_BADGES: Record<string, { key: keyof AdminNavigationCounts; label: string }> = {
  "/admin/products": { key: "pending_products", label: "sản phẩm chờ duyệt" },
  "/admin/email-verifications": { key: "pending_email_verifications", label: "yêu cầu chờ duyệt" },
  "/admin/reports": { key: "pending_reports", label: "báo cáo chờ xử lý" },
  "/admin/support": { key: "open_tickets", label: "yêu cầu hỗ trợ đang mở" },
};

const GROUPS = [...new Set(ADMIN_NAVIGATION.map(item => item.group))];

function AdminNav({ onNavigate, counts }: { onNavigate?: () => void; counts?: AdminNavigationCounts }) {
  const { viewer, logout } = useSession();
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
    <div className="admin-nav">
      <Link to="/admin" onClick={onNavigate} className="admin-nav-brand" aria-label="ReMarket — Trang quản trị">
        <span className="admin-nav-mark">R</span>
        <div><strong>ReMarket</strong><small>Không gian quản trị</small></div>
      </Link>
      <nav aria-label="Khu vực quản trị" className="admin-nav-groups">
        {GROUPS.map(group => (
          <div key={group}>
            <p className="admin-nav-caption">{group}</p>
            {ADMIN_NAVIGATION.filter(item => item.group === group).map(item => {
              const badge = NAV_BADGES[item.to];
              const count = badge && counts?.[badge.key];
              return (
                <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className="admin-nav-link">
                  <Icon name={item.icon} size={18} />
                  <span className="flex-1">{item.label}</span>
                  {badge && !!count && (
                    <span className="admin-nav-count" data-queue={badge.key} aria-label={count + " " + badge.label}>
                      {count > 99 ? "99+" : count}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="admin-nav-footer">
        <button type="button" onClick={handleLogout} disabled={loggingOut} aria-busy={loggingOut} className="admin-nav-account">
          <span className="admin-nav-avatar">{viewer?.full_name.trim().charAt(0).toUpperCase() || "A"}</span>
          <span className="min-w-0 flex-1">
            <strong className="block truncate">{viewer?.full_name ?? "Quản trị viên"}</strong>
            <small>{loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}</small>
          </span>
          <Icon name="logout" size={18} />
        </button>
      </div>
    </div>
  );
}

export function AdminShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const { pathname } = useLocation();
  const { viewer } = useSession();
  const counts = useQuery({
    queryKey: queryKeys.adminNavigationCounts,
    queryFn: ({ signal }) => apiForQuery(signal).admin.navigationCounts(),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
  });
  const { data: unread } = useNavigationCounts();
  const badgeCounts = counts.isError ? undefined : counts.data;
  const current = ADMIN_NAVIGATION.find(item => matchPath(item.to, pathname));
  const route = current ? current.to.slice("/admin/".length) || "dashboard" : "not-found";
  const name = viewer?.full_name.trim() || "Quản trị viên";
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  useEffect(() => { setDrawerOpen(false); setHelpOpen(false); }, [pathname]);

  return (
    <div className="rm-admin-page" data-admin-route={route}>
      <aside className="admin-sidebar"><AdminNav counts={badgeCounts} /></aside>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Menu quản trị" widthClassName="max-w-[320px]" className="admin-mobile-menu">
        <AdminNav counts={badgeCounts} onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
      <div className="admin-workspace">
        <header className="admin-header">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button type="button" aria-label="Mở menu quản trị" onClick={() => setDrawerOpen(true)} className="admin-header-tool admin-menu-toggle"><Icon name="menu" /></button>
            <div className="admin-context">
              <Link to="/admin">Trang quản trị</Link>
              <strong className="truncate" aria-current="page">{current?.label ?? "Không tìm thấy trang"}</strong>
            </div>
          </div>
          <div className="admin-header-actions">
            <Link to="/" className="rm-control admin-utility admin-marketplace">
              <Icon name="store" size={17} />
              <span>Mở marketplace</span>
            </Link>
            <Link to="/notifications" aria-label="Thông báo" className="rm-control admin-header-tool admin-notifications">
              <Icon name="bell" size={18} />
              {!!unread?.notifications && <span className="admin-notification-dot" />}
            </Link>
            <button type="button" aria-label="Trợ giúp quản trị" className="admin-header-tool" onClick={() => setHelpOpen(true)}><Icon name="help" size={18} /></button>
            <div className="admin-header-profile">
              <span className="admin-header-avatar" aria-hidden="true">{initials}</span>
              <span className="truncate">{name}</span>
            </div>
          </div>
        </header>
        <main className="admin-main"><Outlet context={badgeCounts} /></main>
      </div>
      <Drawer open={helpOpen} onClose={() => setHelpOpen(false)} title="Trợ giúp quản trị">
        <p className="mb-4 text-sm text-muted">Chọn khu vực cần truy cập trong không gian quản trị ReMarket.</p>
        <ul className="space-y-2">{ADMIN_NAVIGATION.map(item => <li key={item.to}><Link className="admin-utility w-full justify-start" to={item.to} onClick={() => setHelpOpen(false)}><Icon name={item.icon} size={18} />{item.label}</Link></li>)}</ul>
      </Drawer>
    </div>
  );
}
