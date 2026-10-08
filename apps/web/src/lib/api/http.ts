import type { ApiSuccess, SessionUser } from "@remarket/shared";
import { API_BASE_URL } from "../env";
import { ApiError, networkError } from "../errors";
import { getSessionRevision, updateSessionUser, updateSessionValidation } from "./session";

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
let restorationInFlight: Promise<SessionUser | null> | null = null;
let validationInFlight: Promise<SessionUser | null> | null = null;
let expiredNotified = false;

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) expiredNotified = false;
  else updateSessionUser(null);
}

export function getAccessToken(): string | null {
  return accessToken;
}

function emitSessionExpired(): void {
  if (expiredNotified) return;
  expiredNotified = true;
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

/** Shared by bootstrap, StrictMode re-mounts and every protected 401 response. */
export function restoreSession(): Promise<SessionUser | null> {
  if (restorationInFlight) return restorationInFlight;
  const restore = async () => {
    const data = await send<{ user: SessionUser | null; access_token: string | null }>(
      "/auth/bootstrap",
      { method: "POST", skipAuthRetry: true },
    );
    setAccessToken(data.access_token);
    updateSessionUser(data.user);
    return data.user;
  };
  // The browser lock serializes cookie rotation across tabs as well.
  const pending = Promise.resolve(typeof navigator.locks?.request === "function"
    ? navigator.locks.request("remarket-auth-cookie", restore)
    : restore());
  const restoration = pending.finally(() => { restorationInFlight = null; });
  restorationInFlight = restoration;
  return restoration;
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
      const user = await restoreSession();
      if (!user) emitSessionExpired();
      return user;
    }
  };
  const validate = async () => {
    updateSessionValidation({ status: "checking" });
    try {
      const user = await readIdentity();
      updateSessionValidation({ status: "ready" });
      return user;
    } catch (error) {
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

  const credentialEndpoint = ["/auth/login", "/auth/register", "/auth/bootstrap", "/auth/refresh", "/auth/forgot-password", "/auth/reset-password", "/auth/verify-email", "/auth/resend-verification"].includes(path);
  // Never attach an old private response (or replay a mutation) to a new account.
  if (!credentialEndpoint && requestRevision !== getSessionRevision()) throw sessionChanged();
  if (response.status === 401 && !options.skipAuthRetry && !credentialEndpoint) {
    // A delayed 401 for an old token must not rotate the freshly restored cookie again.
    if (accessToken && accessToken !== requestToken) {
      return send<T>(path, { ...options, skipAuthRetry: true });
    }
    const restored = await restoreSession();
    if (restored) {
      if (requestRevision !== getSessionRevision()) throw sessionChanged();
      return send<T>(path, { ...options, skipAuthRetry: true });
    }
    emitSessionExpired();
    throw new ApiError({ code: "SESSION_EXPIRED", message: "Phiên đăng nhập đã hết hạn.", status: 401 });
  }

  if (response.status === 403 && (path === "/admin" || path.startsWith("/admin/"))) {
    const error: unknown = await parseEnvelope<T>(response).catch((caught: unknown) => caught);
    if (error instanceof ApiError && ["FORBIDDEN", "ACCOUNT_LOCKED"].includes(error.code)) {
      // One shared identity read, never a retry of the forbidden admin operation.
      await revalidateSession();
    }
    throw error;
  }

  return parseEnvelope<T>(response);
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
};
