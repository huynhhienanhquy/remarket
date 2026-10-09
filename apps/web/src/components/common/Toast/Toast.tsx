import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../Icon/Icon";
import type { IconName } from "../Icon/Icon";

export type ToastTone = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  to: string;
}

export interface ToastOptions {
  description?: string;
  action?: ToastAction;
  /** Milliseconds; 0 keeps the toast open. Defaults to 4000, or 0 for errors. */
  duration?: number;
}

export interface ToastItem extends ToastOptions {
  id: string;
  tone: ToastTone;
  title: string;
}

export interface ToastApi {
  success: (title: string, options?: ToastOptions) => string;
  /** Errors stay until dismissed so failures are never missed. */
  error: (title: string, options?: ToastOptions) => string;
  info: (title: string, options?: ToastOptions) => string;
  warning: (title: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
}

export interface ToastProps extends ToastOptions {
  title: string;
  tone?: ToastTone;
  onDismiss: () => void;
  className?: string;
}

const TONE_STYLES: Record<ToastTone, { panel: string; text: string; icon: IconName }> = {
  success: { panel: "border-brand bg-brand-soft", text: "text-brand", icon: "check" },
  error: { panel: "border-danger bg-danger-bg", text: "text-danger", icon: "alert-triangle" },
  info: { panel: "border-info bg-info-bg", text: "text-info", icon: "info" },
  warning: { panel: "border-accent bg-warning-bg", text: "text-accent", icon: "alert-triangle" },
};

/** Reusable toast card with native timers; no toast or icon library required. */
export function Toast({ title, description, action, tone = "info", duration = tone === "error" ? 0 : 4000, onDismiss, className }: ToastProps) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remainingRef = useRef(duration);
  const paused = hovered || focused;
  const toneStyle = TONE_STYLES[tone];

  useEffect(() => {
    remainingRef.current = duration;
  }, [duration]);

  useEffect(() => {
    if (paused || duration <= 0 || !Number.isFinite(duration)) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(onDismiss, Math.max(0, remainingRef.current));
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [duration, paused, onDismiss]);

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-atomic="true"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      className={[
        "pointer-events-auto flex w-full items-start gap-3 rounded-card border p-4 shadow-pop motion-safe:animate-slide-up",
        toneStyle.panel,
        className,
      ].filter(Boolean).join(" ")}
    >
      <span className={`mt-0.5 shrink-0 ${toneStyle.text}`}>
        <Icon name={toneStyle.icon} />
      </span>
      <div className="min-w-0 flex-1 break-words">
        <p className="text-sm font-semibold text-ink">{title}</p>
        {description && <p className="t-meta mt-1 text-muted">{description}</p>}
        {action && (
          <Link to={action.to} onClick={onDismiss} className="mt-2 inline-flex t-label text-brand hover:underline">
            {action.label}
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Đóng thông báo"
        className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
      >
        <Icon name="x" />
      </button>
    </div>
  );
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast phải được dùng bên trong ToastProvider.");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);
  const dismissAll = useCallback(() => setToasts([]), []);

  const push = useCallback((tone: ToastTone, title: string, options?: ToastOptions): string => {
    const id = `toast-${++nextIdRef.current}`;
    setToasts((current) => [...current, { ...options, id, tone, title }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({
    success: (title, options) => push("success", title, options),
    error: (title, options) => push("error", title, options),
    info: (title, options) => push("info", title, options),
    warning: (title, options) => push("warning", title, options),
    dismiss,
    dismissAll,
  }), [push, dismiss, dismissAll]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-[calc(env(safe-area-inset-top)+64px)] z-toast flex max-h-[calc(100dvh-128px)] flex-col gap-2 overflow-y-auto sm:inset-x-auto sm:right-4 sm:top-24 sm:w-[400px]">
        {toasts.map(({ id, ...toast }) => (
          <Toast key={id} {...toast} onDismiss={() => dismiss(id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
