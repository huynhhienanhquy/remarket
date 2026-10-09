import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { SessionUser } from "@remarket/shared";
import { isRouteAllowedWhenLocked } from "@remarket/shared";
import { useSession } from "../../contexts/SessionContext";
import { PageSkeleton } from "../../components/common/PageSkeleton/PageSkeleton";

/** Internal-only return target so login never redirects off-origin. */
export function safeReturnTo(pathname: string, search: string): string {
  const target = `${pathname}${search}`;
  const unsafeCharacter = [...target].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127);
  if (!target.startsWith("/") || target.startsWith("//") || target.includes("\\") || unsafeCharacter) return "/";
  try {
    const url = new URL(target, "https://remarket.invalid");
    if (url.origin !== "https://remarket.invalid" || url.pathname.startsWith("//")) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/** One login page; destinations use the authenticated user returned by the API. */
export function postLoginPath(
  viewer: Pick<SessionUser, "role" | "status">,
  returnTo?: string | null,
): string {
  const home = viewer.status === "LOCKED" ? "/orders" : viewer.role === "ADMIN" ? "/admin" : "/";
  const target = safeReturnTo(returnTo ?? "/", "");
  let pathname: string;
  try {
    pathname = decodeURIComponent(target.split(/[?#]/)[0]!).toLowerCase().replace(/\/+$/, "") || "/";
  } catch {
    return home;
  }
  if (pathname.includes("\\") || pathname.startsWith("//")) return home;
  // Never send an authenticated visitor back into a guest-only auth page.
  if (["/login", "/register", "/forgot-password", "/reset-password"].includes(pathname)) return home;
  if (viewer.status === "LOCKED") return isRouteAllowedWhenLocked(pathname) ? target : home;
  const adminRoute = pathname === "/admin" || pathname.startsWith("/admin/");
  if (viewer.role === "ADMIN") return adminRoute ? target : home;
  return adminRoute ? home : target;
}

export function loginPathFor(pathname: string, search: string): string {
  const returnTo = safeReturnTo(pathname, search);
  return returnTo === "/" ? "/login" : `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * Private routes render nothing until the session check finishes, then either
 * the content or an internal login redirect with `returnTo` (ui-spec 24).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { viewer, status } = useSession();
  const location = useLocation();

  if (status === "loading") return <PageSkeleton />;
  if (!viewer) {
    return <Navigate to={loginPathFor(location.pathname, location.search)} replace />;
  }
  // LOCKED accounts keep orders, support and notifications only (3.10).
  if (viewer.status === "LOCKED" && !isRouteAllowedWhenLocked(location.pathname)) {
    return <Navigate to="/orders" replace />;
  }
  return <>{children}</>;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { viewer, status } = useSession();
  const location = useLocation();

  if (status === "loading") return <PageSkeleton />;
  if (!viewer) {
    return <Navigate to={loginPathFor(location.pathname, location.search)} replace />;
  }
  if (viewer.role !== "ADMIN") return <Navigate to="/403" replace />;
  if (viewer.status !== "ACTIVE") return <Navigate to="/orders" replace />;
  return <>{children}</>;
}

/** Selling requires a verified email (detail-project 3.1 and 4.1). */
export function RequireVerified({ children }: { children: ReactNode }) {
  const { viewer, status } = useSession();
  const location = useLocation();

  if (status === "loading") return <PageSkeleton />;
  if (!viewer) {
    return <Navigate to={loginPathFor(location.pathname, location.search)} replace />;
  }
  if (viewer.email_verified_at === null) {
    const params = new URLSearchParams({
      email: viewer.email,
      returnTo: safeReturnTo(location.pathname, location.search),
    });
    return <Navigate to={`/verify-email?${params.toString()}`} replace />;
  }
  return <>{children}</>;
}

/** Existing sessions use the same role-based routing as a successful login. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { viewer, status } = useSession();
  const location = useLocation();

  if (status === "loading") return <PageSkeleton />;
  if (viewer) {
    const returnTo = new URLSearchParams(location.search).get("returnTo");
    return <Navigate to={postLoginPath(viewer, returnTo)} replace />;
  }
  return <>{children}</>;
}
