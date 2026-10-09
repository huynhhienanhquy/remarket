import { Suspense } from "react";
import { Outlet } from "react-router-dom";
import { ToastProvider } from "../../components/common";
import { PageSkeleton } from "../../components/common/PageSkeleton/PageSkeleton";
import { SessionExpiryWatcher } from "../../components/SessionExpiryWatcher/SessionExpiryWatcher";
import { ShellProvider } from "../../contexts/ShellContext";

/**
 * Router root: providers that must render <Link> (toast actions) live inside
 * the router, and every session reaction happens once, above all routes.
 */
export function RootLayout() {
  return (
    <ToastProvider>
      <ShellProvider>
        <SessionExpiryWatcher />
        <Suspense fallback={<PageSkeleton label="Đang tải trang…" />}>
          <Outlet />
        </Suspense>
      </ShellProvider>
    </ToastProvider>
  );
}
