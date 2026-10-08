import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangleIcon, CheckIcon, InfoIcon, XIcon } from "./icons";
import type { IconProps } from "./icons";

export type ToastTone = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  to: string;
}

export interface ToastOptions {
  description?: string;
  action?: ToastAction;
}

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  action?: ToastAction;
}

export interface ToastApi {
  success: (title: string, options?: ToastOptions) => string;
  /** Errors stay until dismissed so failures are never missed. */
  error: (title: string, options?: ToastOptions) => string;
  info: (title: string, options?: ToastOptions) => string;
  dismiss: (id: string) => void;
}

interface ToneStyle {
  panel: string;
  text: string;
  Icon: ComponentType<IconProps>;
}

const TONE_STYLES: Record<ToastTone, ToneStyle> = {
  success: { panel: "border-brand bg-brand-soft", text: "text-brand", Icon: CheckIcon },
  error: { panel: "border-danger bg-danger-bg", text: "text-danger", Icon: AlertTriangleIcon },
  info: { panel: "border-info bg-info-bg", text: "text-info", Icon: InfoIcon },
};

const AUTO_DISMISS_MS = 4000;

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast phải được dùng bên trong ToastProvider.");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());
  const nextIdRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, title: string, options?: ToastOptions): string => {
      nextIdRef.current += 1;
      const id = `toast-${nextIdRef.current}`;
      setToasts((current) => [
        ...current,
        { id, tone, title, description: options?.description, action: options?.action },
      ]);
      if (tone !== "error") {
        const timer = window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
        timersRef.current.set(id, timer);
      }
      return id;
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current.clear();
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, options) => push("success", title, options),
      error: (title, options) => push("error", title, options),
      info: (title, options) => push("info", title, options),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+16px)] z-toast flex flex-col gap-2 sm:inset-x-auto sm:bottom-auto sm:right-4 sm:top-24 sm:w-[400px]"
      >
        {toasts.map((toast) => {
          const toneStyle = TONE_STYLES[toast.tone];
          return (
            <div
              key={toast.id}
              className={[
                "pointer-events-auto flex w-full items-start gap-3 rounded-card border p-4 shadow-pop animate-slide-up",
                toneStyle.panel,
              ].join(" ")}
            >
              <span className={`mt-0.5 shrink-0 ${toneStyle.text}`}>
                <toneStyle.Icon />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{toast.title}</p>
                {toast.description && (
                  <p className="t-meta mt-1 text-muted">{toast.description}</p>
                )}
                {toast.action && (
                  <Link
                    to={toast.action.to}
                    onClick={() => dismiss(toast.id)}
                    className="mt-2 inline-flex t-label text-brand hover:underline"
                  >
                    {toast.action.label}
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="Đóng thông báo"
                className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:text-ink"
              >
                <XIcon />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
