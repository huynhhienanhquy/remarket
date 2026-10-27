import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { AdminNavigationCounts } from "@remarket/shared";
import { useSession } from "../../contexts/SessionContext";
import { Drawer, Icon, useToast } from "../../components/common";
import { ADMIN_NAVIGATION } from "../../config/route/adminNavigation";
import { errorTitle } from "../../helpers/errors";
import { queryKeys } from "../../config/queryClient";
import { apiForQuery } from "../../services/api";

const NAV_BADGES: Record<string, { key: keyof AdminNavigationCounts; label: string }> = {
  "/admin/products": { key: "pending_products", label: "sản phẩm chờ duyệt" },
  "/admin/email-verifications": { key: "pending_email_verifications", label: "yêu cầu chờ duyệt" },
  "/admin/reports": { key: "pending_reports", label: "báo cáo chờ xử lý" },
  "/admin/support": { key: "open_tickets", label: "yêu cầu hỗ trợ đang mở" },
};

function AdminNav({ onNavigate, dark = false, counts }: { onNavigate?: () => void; dark?: boolean; counts?: AdminNavigationCounts }) {
  const { viewer, logout } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const [loggingOut, setLoggingOut] = useState(false);
  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await logout(); navigate("/"); }
    catch (error) { toast.error("Chưa thể đăng xuất", { description: errorTitle(error) }); }
    finally { setLoggingOut(false); }
  }
  const groups = [...new Set(ADMIN_NAVIGATION.map(item => item.group))];
  function badgeFor(path: string) {
    const badge = NAV_BADGES[path];
    const count = badge && counts?.[badge.key];
    return badge && count ? <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-accent" aria-label={`${count} ${badge.label}`}>{count > 99 ? "99+" : count}</span> : null;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {dark && <Link to="/admin" className="flex h-24 shrink-0 items-center gap-3 px-6" aria-label="ReMarket — Trang quản trị"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-xl font-bold text-white">R</span><div><span className="text-xl font-semibold tracking-tight text-white">ReMarket</span><p className="mt-0.5 text-xs text-white/60">Không gian quản trị</p></div></Link>}
      <nav aria-label="Khu vực quản trị" className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {groups.map(group => <div key={group}><p className={`mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest ${dark ? "text-white/50" : "text-muted"}`}>{group}</p><div className="space-y-1">{ADMIN_NAVIGATION.filter(item => item.group === group).map(item => <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? dark ? "bg-brand text-white shadow-subtle" : "bg-brand-soft text-brand" : dark ? "text-white/75 hover:bg-white/10 hover:text-white" : "text-muted hover:bg-surface-subtle hover:text-ink"}`}><Icon name={item.icon} size={20} /><span className="flex-1">{item.label}</span>{badgeFor(item.to)}</NavLink>)}</div></div>)}
      </nav>
      <div className={`space-y-1 border-t p-3 ${dark ? "border-white/10" : "border-line"}`}>
        <Link to="/" onClick={onNavigate} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm ${dark ? "text-white/75 hover:bg-white/10" : "text-muted hover:bg-surface-subtle"}`}><Icon name="external-link" size={20} />Về marketplace</Link>
        <div className={`mt-2 flex min-w-0 items-center gap-3 rounded-xl p-3 ${dark ? "bg-white/5" : "bg-page"}`}><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-sm font-semibold text-brand">{viewer?.full_name.trim().slice(0, 1).toUpperCase() ?? "A"}</span><div className="min-w-0 flex-1"><p className={`truncate text-sm font-medium ${dark ? "text-white" : "text-ink"}`}>{viewer?.full_name ?? "Quản trị viên"}</p><button type="button" onClick={handleLogout} disabled={loggingOut} aria-busy={loggingOut} className={`mt-1 min-h-11 text-xs underline-offset-4 hover:underline disabled:opacity-50 ${dark ? "text-white/60" : "text-muted"}`}>{loggingOut ? "Đang đăng xuất…" : "Đăng xuất"}</button></div></div>
      </div>
    </div>
  );
}

export function AdminShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const counts = useQuery({
    queryKey: queryKeys.adminNavigationCounts,
    queryFn: ({ signal }) => apiForQuery(signal).admin.navigationCounts(),
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: "always",
  });
  const badgeCounts = counts.isError ? undefined : counts.data;
  const current = ADMIN_NAVIGATION.find(item => item.to === location.pathname);
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);
  return (
    <div className="rm-admin-page min-h-screen bg-page">
      <aside className="fixed inset-y-0 left-0 z-header hidden w-[264px] bg-ink lg:block"><AdminNav dark counts={badgeCounts} /></aside>
      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Menu quản trị" widthClassName="max-w-[320px]"><AdminNav counts={badgeCounts} onNavigate={() => setDrawerOpen(false)} /></Drawer>
      <div className="min-w-0 lg:pl-[264px]">
        <header className="sticky top-0 z-section flex h-16 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6 lg:h-20 lg:px-8">
          <div className="flex min-w-0 items-center gap-3"><button type="button" aria-label="Mở menu quản trị" onClick={() => setDrawerOpen(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-line text-ink hover:bg-surface-subtle lg:hidden"><Icon name="menu" /></button><div><p className="text-xs text-muted">Trang quản trị</p><p className="mt-0.5 text-sm font-semibold text-ink">{current?.label ?? "ReMarket"}</p></div></div>
          <Link to="/" className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line px-3 text-sm font-medium text-muted hover:bg-brand-soft hover:text-brand"><Icon name="external-link" size={18} /><span className="hidden sm:inline">Mở marketplace</span><span className="sr-only sm:hidden">Mở marketplace</span></Link>
        </header>
        <main className="mx-auto max-w-[1680px] min-w-0 p-4 sm:p-6 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
