import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Shared shell state: pages register the compact mobile header title so deep
 * task pages get "Quay lại + tiêu đề" instead of repeating search (ui-spec 3).
 */
interface ShellState {
  mobileTitle: string | null;
  setMobileTitle: (title: string | null) => void;
}

const ShellContext = createContext<ShellState | null>(null);

export function ShellProvider({ children }: { children: ReactNode }) {
  const [mobileTitle, setMobileTitle] = useState<string | null>(null);
  const value = useMemo(
    () => ({ mobileTitle, setMobileTitle }),
    [mobileTitle],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/**
 * Declares the compact mobile header title for the current page. Pass `null`
 * to opt out (the page keeps the standard mobile header with search).
 */
export function useShellTitle(title: string | null) {
  const context = useContext(ShellContext);
  useEffect(() => {
    if (!context || title === null) return;
    context.setMobileTitle(title);
    return () => context.setMobileTitle(null);
  }, [context, title]);
}

/** `/orders/abc` → `/orders`; `/` stays `/`. Used as the back-link fallback. */
export function parentPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length <= 1) return "/";
  return `/${parts.slice(0, -1).join("/")}`;
}
