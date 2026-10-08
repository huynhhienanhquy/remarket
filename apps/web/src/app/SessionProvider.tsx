import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { SessionUser } from "@remarket/shared";
import { api } from "../lib/api";
import type { RegisterInput } from "../lib/api/contract";
import { Button, InlineAlert } from "../components/ui";
import { errorTitle } from "../lib/errors";
import { sameSessionContext, subscribeSessionUser, subscribeSessionValidation } from "../lib/api/session";
import { PageSkeleton } from "./PageSkeleton";
import { ApiError } from "../lib/errors";
import { http, listenForSessionChanges, SESSION_COOKIE_CHANGED_EVENT } from "../lib/api/http";

type SessionStatus = "loading" | "ready";

interface SessionContextValue {
  viewer: SessionUser | null;
  status: SessionStatus;
  /** Re-reads /auth/me; used after login, verify, profile update and logout. */
  refresh: () => Promise<SessionUser | null>;
  login: (email: string, password: string) => Promise<SessionUser>;
  register: (input: RegisterInput) => Promise<{ pending_verification: true; email: string }>;
  logout: () => Promise<void>;
  /** Called by the transport when refresh fails (ui-spec 24). */
  expire: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/**
 * Initial session check runs exactly once so the app can render the skeleton
 * shell instead of flashing Guest UI before the refresh finishes (ui-spec 24).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [viewer, setViewer] = useState<SessionUser | null>(null);
  const viewerRef = useRef<SessionUser | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [bootstrapError, setBootstrapError] = useState<unknown>(null);
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [validationPending, setValidationPending] = useState(false);

  const applyUser = useCallback((user: SessionUser | null) => {
    if (!sameSessionContext(viewerRef.current, user)) {
      // Cancel/remove old requests before guards render the new permission set.
      queryClient.clear();
    }
    viewerRef.current = user;
    setViewer(user);
  }, [queryClient]);

  useEffect(() => subscribeSessionUser(applyUser), [applyUser]);
  useEffect(() => subscribeSessionValidation((state) => {
    if (state.status === "checking") {
      // Hide private content without unmounting queries: an unchanged ADMIN
      // receiving a legitimate 403 must not enter a remount/refetch loop.
      setValidationPending(true);
    } else if (state.status === "ready") {
      setBootstrapError(null);
      setValidationPending(false);
    } else {
      queryClient.clear();
      setValidationPending(false);
      setBootstrapError(state.error);
    }
  }), [queryClient]);

  const refresh = useCallback(async () => {
    const user = await api.auth.me();
    applyUser(user);
    return user;
  }, [applyUser]);

  useEffect(() => {
    let cancelled = false;
    api.auth
      .bootstrap()
      .then((user) => {
        if (!cancelled) {
          applyUser(user);
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          if (error instanceof ApiError && error.code === "SESSION_CHANGED") return;
          // A database/network failure is not proof of an anonymous session.
          setBootstrapError(error);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrapAttempt, applyUser]);

  useEffect(() => {
    let disposed = false;
    let checking = false;
    const sync = async () => {
      if (checking || !navigator.onLine || document.visibilityState === "hidden") return;
      checking = true;
      setValidationPending(true);
      try {
        const user = await http.restoreSession();
        if (!disposed) { applyUser(user); setStatus("ready"); setBootstrapError(null); }
      } catch (error) {
        if (!disposed && !(error instanceof ApiError && error.code === "SESSION_CHANGED")) {
          queryClient.clear(); setBootstrapError(error);
        }
      } finally { checking = false; if (!disposed) setValidationPending(false); }
    };
    const resume = () => { if (document.visibilityState !== "hidden") void sync(); };
    const unsubscribe = listenForSessionChanges();
    window.addEventListener(SESSION_COOKIE_CHANGED_EVENT, resume);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true; unsubscribe();
      window.removeEventListener(SESSION_COOKIE_CHANGED_EVENT, resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [applyUser, queryClient]);

  const login = useCallback(async (email: string, password: string) => {
    const user = await api.auth.login(email, password);
    applyUser(user);
    setStatus("ready");
    setBootstrapError(null);
    return user;
  }, [applyUser]);

  // REST fallback for admin approval when realtime is unavailable. No overlapping
  // checks, no polling hidden/offline tabs, no change to refresh-cookie rotation.
  const pendingVerification = !!viewer && viewer.status === "ACTIVE" && !viewer.email_verified_at;
  const verificationViewerId = viewer?.id;
  useEffect(() => {
    if (!pendingVerification) return;
    let disposed = false;
    let checking = false;
    const check = async () => {
      if (checking || !navigator.onLine || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const user = await api.auth.me();
        if (!disposed) applyUser(user);
      } catch { /* Network errors are surfaced by the active page; retry later. */ }
      finally { checking = false; }
    };
    const interval = window.setInterval(() => void check(), 15000);
    const resume = () => void check();
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      disposed = true; window.clearInterval(interval);
      window.removeEventListener("online", resume); window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [verificationViewerId, pendingVerification, applyUser]);

  const register = useCallback(
    async (input: RegisterInput) => api.auth.register(input),
    [],
  );

  const logout = useCallback(async () => {
    await api.auth.logout();
    applyUser(null);
  }, [applyUser]);

  const expire = useCallback(() => {
    applyUser(null);
  }, [applyUser]);

  const value = useMemo<SessionContextValue>(
    () => ({ viewer, status, refresh, login, register, logout, expire }),
    [viewer, status, refresh, login, register, logout, expire],
  );

  return (
    <SessionContext.Provider value={value}>
      {bootstrapError !== null ? (
        <div className="rm-container py-12 space-y-4">
          <InlineAlert tone="danger" title="Chưa thể kiểm tra phiên đăng nhập">{errorTitle(bootstrapError)}</InlineAlert>
          <Button onClick={() => {
            setStatus("loading");
            setBootstrapError(null);
            setBootstrapAttempt((attempt) => attempt + 1);
          }}>Thử lại</Button>
        </div>
      ) : <>
        {validationPending && <PageSkeleton />}
        <div hidden={validationPending} className={validationPending ? "hidden" : "contents"} aria-hidden={validationPending || undefined}>{children}</div>
      </>}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession must be used inside <SessionProvider>");
  return context;
}

/** Convenience for pages that only need the current viewer. */
export function useViewer(): SessionUser | null {
  return useSession().viewer;
}
