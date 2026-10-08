import type { ApiSuccess, SessionUser } from "@remarket/shared";
import { API_BASE_URL } from "../env";
import { ApiError, networkError } from "../errors";
import { getSessionRevision, getSessionUser, updateSessionUser, updateSessionValidation } from "./session";

/**
 * Live transport for the REST contract (detail-project 14).
 *
 * Access token stays in memory only; the refresh token is an httpOnly cookie.
 * A 401 triggers one shared refresh attempt so parallel requests do not stampede
 * (ui-spec 24). An empty session emits one session-expired event; server or
 * network failures are reported as errors, not mistaken for logout.
 */

export const SESSION_EXPIRED_EVENT = "remarket:session-expired";

let accessToken: string | null = null;
let restorationInFlight: { epoch: number; mode: string; promise: Promise<SessionUser | null> } | null = null;
let credentialEpoch = 0;
let cookieQueue: Promise<unknown> = Promise.resolve();
let validationInFlight: Promise<SessionUser | null> | null = null;
let expiredNotified = false;
const accessTokenListeners = new Set<(token: string | null) => void>();
const tabId = crypto.randomUUID();

export function subscribeAccessToken(listener: (token: string | null) => void): () => void {
  accessTokenListeners.add(listener);
  return () => { accessTokenListeners.delete(listener); };
}

export function setAccessToken(token: string | null): void {
  if (!token) credentialEpoch += 1;
  applyAccessToken(token);
}

function applyAccessToken(token: string | null): void {
  accessToken = token;
  if (token) expiredNotified = false;
  else updateSessionUser(null);
  for (const listener of accessTokenListeners) listener(token);
}

export function getAccessToken(): string | null {
  return accessToken;
}

function emitSessionExpired(): void {
  if (expiredNotified) return;
  expiredNotified = true;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

/** Serialize all cookie-changing actions, not just refresh, across tabs. */
function withCookieLock<T>(action: () => Promise<T>): Promise<T> {
  const pending = cookieQueue.then(async () => typeof navigator.locks?.request === "function"
    ? await navigator.locks.request("remarket-auth-cookie", action) : await action());
  cookieQueue = pending.catch(() => undefined);
  return pending;
}

function assertCredentialEpoch(epoch: number): void {
  if (epoch !== credentialEpoch) throw sessionChanged();
}

type SessionCredentials = { user: SessionUser | null; access_token: string | null };
function applyCredentials(data: SessionCredentials, authenticated = false): void {
  if (!data || (data.user === null) !== (data.access_token === null)
    || (authenticated && data.user === null)
    || (data.user !== null && (typeof data.user?.id !== "string" || !data.user.id
      || !["USER", "ADMIN"].includes(data.user.role) || !["ACTIVE", "LOCKED"].includes(data.user.status)
      || typeof data.access_token !== "string" || !data.access_token))) {
    throw new ApiError({ code: "INVALID_AUTH_RESPONSE", message: "Phản hồi phiên đăng nhập không hợp lệ.", status: 502 });
  }
  setAccessToken(data.access_token);
  updateSessionUser(data.user);
}

/** Bootstrap is non-consuming; access expiry uses actual atomic rotation. */
export function restoreSession(mode: "bootstrap" | "refresh" = "bootstrap"): Promise<SessionUser | null> {
  const epoch = credentialEpoch;
  if (restorationInFlight?.epoch === epoch && restorationInFlight.mode === mode) return restorationInFlight.promise;
  const restore = async () => {
    assertCredentialEpoch(epoch);
    let data: SessionCredentials;
    try {
      data = await send<SessionCredentials>(`/auth/${mode}`, { method: "POST", skipAuthRetry: true });
    } catch (error) {
      assertCredentialEpoch(epoch);
      if (mode !== "refresh" || !(error instanceof ApiError) || error.status !== 401) throw error;
      data = { user: null, access_token: null };
    }
    assertCredentialEpoch(epoch);
    applyCredentials(data);
    return data.user;
  };
  const restoration = withCookieLock(restore).finally(() => {
    if (restorationInFlight?.promise === restoration) restorationInFlight = null;
  });
  restorationInFlight = { epoch, mode, promise: restoration };
  return restoration;
}

export const SESSION_COOKIE_CHANGED_EVENT = "remarket:session-cookie-changed";
/** No token or PII crosses tabs. Only a hint to check the server-owned cookie. */
function notifyCookieChange(): void {
  if (typeof window.BroadcastChannel !== "function") return;
  try {
    const channel = new window.BroadcastChannel("remarket-auth");
    channel.postMessage({ type: "cookie-changed", sender: tabId });
    channel.close();
  } catch { /* Optional hint; focus/online still revalidates server identity. */ }
}

/** Credential actions invalidate late discoveries/private responses immediately. */
export function changeSession<T>(action: (assertCurrent: () => void) => Promise<T>): Promise<T> {
  const epoch = ++credentialEpoch;
  return withCookieLock(async () => {
    assertCredentialEpoch(epoch);
    try {
      const result = await action(() => assertCredentialEpoch(epoch));
      notifyCookieChange();
      return result;
    } catch (error) {
      if (error instanceof ApiError && error.code === "SESSION_CHANGED") {
        // A superseded response may already have changed the browser cookie.
        // Hide stale memory, but do not cancel the newer queued user intent.
        applyAccessToken(null);
        notifyCookieChange();
      }
      throw error;
    }
  });
}

/** Public identity may also change while no protected request is running. */
export function listenForSessionChanges(): () => void {
  if (typeof window.BroadcastChannel !== "function") return () => undefined;
  let channel: BroadcastChannel;
  try { channel = new window.BroadcastChannel("remarket-auth"); }
  catch { return () => undefined; }
  channel.onmessage = (event: MessageEvent<unknown>) => {
    const data = event.data as { type?: unknown; sender?: unknown } | null;
    if (!data || data.type !== "cookie-changed" || typeof data.sender !== "string" || data.sender === tabId) return;
    setAccessToken(null);
    window.dispatchEvent(new CustomEvent(SESSION_COOKIE_CHANGED_EVENT));
  };
  return () => channel.close();
}

/** A denied admin request may mean the database role/state changed, not expiry. */
function revalidateSession(): Promise<SessionUser | null> {
  if (validationInFlight) return validationInFlight;
  const readIdentity = async () => {
    try {
      const user = await send<SessionUser>("/auth/me", { skipAuthRetry: true });
      updateSessionUser(user);
      return user;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      const user = await restoreSession("refresh");
      if (!user) emitSessionExpired();
      return user;
    }
  };
  const validate = async () => {
    const epoch = credentialEpoch;
    updateSessionValidation({ status: "checking" });
    try {
      const user = await readIdentity();
      updateSessionValidation({ status: "ready" });
      return user;
    } catch (error) {
      if (epoch !== credentialEpoch || (error instanceof ApiError && error.code === "SESSION_CHANGED")) {
        updateSessionValidation({ status: "ready" });
        throw sessionChanged();
      }
      // Keep private screens suspended until identity can be verified again.
      updateSessionValidation({ status: "error", error });
      throw error;
    }
  };
  const validation = validate().finally(() => { validationInFlight = null; });
  validationInFlight = validation;
  return validation;
}

function sessionChanged(): ApiError {
  return new ApiError({ code: "SESSION_CHANGED", status: 409, message: "Tài khoản hoặc quyền truy cập đã thay đổi. Vui lòng kiểm tra lại trước khi tiếp tục." });
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  headers?: Record<string, string>;
  /** Skip the refresh-and-retry dance (used by the refresh call itself). */
  skipAuthRetry?: boolean;
  /** Only the final protected retry may definitively expire local identity. */
  terminalAuthFailure?: boolean;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(`${API_BASE_URL}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

const MEDIA_URL_KEYS = new Set(["url", "image_url", "avatar_url"]);

/**
 * API media paths are deliberately relative so the backend can sit behind a
 * reverse proxy. When VITE_API_BASE_URL points at another origin (the common
 * local setup), resolve those paths against the API origin rather than the
 * web origin.
 */
export function resolveApiMediaUrls(value: unknown, key?: string): unknown {
  if (typeof value === "string") {
    if (!key || !MEDIA_URL_KEYS.has(key) || !value.startsWith("/")) return value;
    const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin;
    return new URL(value, apiOrigin).toString();
  }
  if (Array.isArray(value)) return value.map((item) => resolveApiMediaUrls(item));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      output[entryKey] = resolveApiMediaUrls(entryValue, entryKey);
    }
    return output;
  }
  return value;
}

async function parseEnvelope<T>(response: Response): Promise<T> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    const envelope = payload as ApiSuccess<T> | null;
    return resolveApiMediaUrls(envelope?.data ?? payload) as T;
  }

  const errorBody = payload as
    | { error?: { code?: string; message?: string; details?: Record<string, unknown> }; meta?: { request_id?: string } }
    | null;
  throw new ApiError({
    code: errorBody?.error?.code ?? `HTTP_${response.status}`,
    message: errorBody?.error?.message ?? "Có lỗi xảy ra. Vui lòng thử lại.",
    status: response.status,
    details: errorBody?.error?.details,
    requestId: errorBody?.meta?.request_id,
    fields: (errorBody?.error?.details as { fields?: Record<string, string> } | undefined)?.fields,
  });
}

async function send<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = { ...options.headers };
  const requestToken = accessToken;
  const requestRevision = getSessionRevision();
  const requestEpoch = credentialEpoch;
  if (requestToken) headers.Authorization = `Bearer ${requestToken}`;

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body,
      credentials: "include",
    });
  } catch {
    throw networkError();
  }

  const credentialEndpoint = ["/auth/login", "/auth/register", "/auth/bootstrap", "/auth/refresh", "/auth/logout", "/auth/logout-all", "/auth/forgot-password", "/auth/reset-password", "/auth/verify-email", "/auth/resend-verification"].includes(path);
  // Never attach an old private response (or replay a mutation) to a new account.
  const assertRequestContext = () => {
    if (!credentialEndpoint && (requestEpoch !== credentialEpoch || requestRevision !== getSessionRevision())) throw sessionChanged();
  };
  assertRequestContext();
  if (response.status === 401 && !options.skipAuthRetry && !credentialEndpoint) {
    // A delayed 401 for an old token must not rotate the freshly restored cookie again.
    if (accessToken && accessToken !== requestToken) {
      return send<T>(path, { ...options, skipAuthRetry: true, terminalAuthFailure: true });
    }
    const restored = await restoreSession("refresh");
    if (restored) {
      if (requestRevision !== getSessionRevision()) throw sessionChanged();
      return send<T>(path, { ...options, skipAuthRetry: true, terminalAuthFailure: true });
    }
    emitSessionExpired();
    throw new ApiError({ code: "SESSION_EXPIRED", message: "Phiên đăng nhập đã hết hạn.", status: 401 });
  }

  if (response.status === 401 && options.terminalAuthFailure && !credentialEndpoint) {
    setAccessToken(null);
    emitSessionExpired();
  }

  if (response.status === 403 && !credentialEndpoint) {
    const error: unknown = await parseEnvelope<T>(response).catch((caught: unknown) => caught);
    assertRequestContext();
    if (error instanceof ApiError && (error.code === "ACCOUNT_LOCKED" || (["FORBIDDEN", "EMAIL_NOT_VERIFIED"].includes(error.code) && (path.startsWith("/admin/") || error.code === "EMAIL_NOT_VERIFIED")))) {
      // One shared identity read, never a retry of the forbidden admin operation.
      await revalidateSession();
    }
    throw error;
  }

  const data = await parseEnvelope<T>(response);
  assertRequestContext();
  return data;
}

export const http = {
  get: <T>(path: string, query?: RequestOptions["query"]) =>
    send<T>(path, { method: "GET", query }),
  post: <T>(
    path: string,
    body?: unknown,
    query?: RequestOptions["query"],
    headers?: RequestOptions["headers"],
  ) => send<T>(path, { method: "POST", body, query, headers }),
  patch: <T>(path: string, body?: unknown) => send<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => send<T>(path, { method: "PUT", body }),
  delete: <T>(path: string) => send<T>(path, { method: "DELETE" }),
  /** An identity lookup may return null for a genuinely expired session. */
  getOrNull: async <T>(path: string): Promise<T | null> => {
    try {
      return await send<T>(path);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  setAccessToken,
  getAccessToken,
  restoreSession,
  changeSession,
  applyCredentials,
  /** Updating /me here keeps callers from applying a late response themselves. */
  readSession: async () => {
    const epoch = credentialEpoch;
    const user = await http.getOrNull<SessionUser>("/auth/me");
    if (user) assertCredentialEpoch(epoch);
    // A genuinely empty session has already cleared the token in recovery.
    updateSessionUser(user);
    return getSessionUser();
  },
};
