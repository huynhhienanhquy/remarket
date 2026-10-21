import { validApiResponse, apiResponseIssue } from "@remarket/shared";
import { ApiError } from "./errors.js";

export type Query = Record<
  string,
  string | number | boolean | null | undefined
>;
export interface HttpTransport {
  get<T>(path: string, query?: Query): Promise<T>;
  post<T>(
    path: string,
    body?: unknown,
    query?: Query,
    headers?: Record<string, string>,
  ): Promise<T>;
  put<T>(path: string, body?: unknown): Promise<T>;
  patch<T>(path: string, body?: unknown): Promise<T>;
  delete<T>(path: string): Promise<T>;
}

export function mediaUrl(value: string, baseUrl: string): string {
  return value.startsWith("/api/v1/uploads/")
    ? new URL(value, baseUrl).toString()
    : value;
}
export function resolveMedia(value: unknown, baseUrl: string): unknown {
  if (Array.isArray(value))
    return value.map((item) => resolveMedia(item, baseUrl));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        (key === "url" || key.endsWith("_url")) && typeof item === "string"
          ? mediaUrl(item, baseUrl)
          : resolveMedia(item, baseUrl),
      ]),
    );
  return value;
}

export interface TransportOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  getToken?: () => string | null;
  getGeneration?: () => number;
  refresh?: () => Promise<boolean>;
  onExpired?: () => Promise<void>;
  /** Revalidate identity after a policy denial; never repeat the denied operation. */
  onForbidden?: () => Promise<void>;
  timeoutMs?: number;
}

export function createTransport(options: TransportOptions): HttpTransport {
  const base = new URL(options.baseUrl);
  if (!/^https?:$/.test(base.protocol))
    throw new Error("API URL phải dùng HTTP hoặc HTTPS.");
  const requestFetch = options.fetch ?? globalThis.fetch;
  async function send<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Query,
    extra?: Record<string, string>,
    retried = false,
  ): Promise<T> {
    const generation = options.getGeneration?.();
    const token = options.getToken?.();
    const assertCurrent = () => {
      if (generation !== options.getGeneration?.())
        throw new ApiError({
          code: "SESSION_CHANGED",
          message: "Phiên đăng nhập đã thay đổi.",
          status: 409,
        });
    };
    const url = new URL(options.baseUrl.replace(/\/$/, "") + path);
    for (const [key, value] of Object.entries(query ?? {}))
      if (value !== undefined && value !== null && value !== "")
        url.searchParams.set(key, String(value));
    const multipart =
      typeof FormData !== "undefined" && body instanceof FormData;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...extra,
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined && !multipart)
      headers["Content-Type"] = "application/json";
    const controller = new AbortController();
    const defaultTimeout =
      path === "/uploads"
        ? 90_000
        : path === "/mobile/delete-account"
          ? 60_000
          : 20_000;
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? defaultTimeout,
    );
    try {
      let response: Response;
      try {
        response = await requestFetch(url.toString(), {
          method,
          headers,
          credentials: "omit",
          signal: controller.signal,
          body:
            body === undefined
              ? undefined
              : multipart
                ? (body as FormData)
                : JSON.stringify(body),
        });
      } catch {
        assertCurrent();
        throw new ApiError({
          code: "NETWORK_ERROR",
          message: "Không thể kết nối máy chủ. Vui lòng thử lại.",
          status: 0,
        });
      }
      assertCurrent();
      const credentialEndpoint =
        /^\/auth\/(?:mobile\/)?(?:login|register|bootstrap|refresh|logout|logout-all|verify-email|forgot-password|reset-password|resend-verification)$/.test(
          path,
        );
      if (
        response.status === 401 &&
        !credentialEndpoint &&
        !retried &&
        options.refresh
      ) {
        const restored =
          (token !== options.getToken?.() && !!options.getToken?.()) ||
          (await options.refresh());
        assertCurrent();
        if (restored) return send<T>(method, path, body, query, extra, true);
      }
      const payload = (await response.json().catch(() => null)) as {
        data?: T;
        error?: {
          code?: string;
          message?: string;
          details?: Record<string, unknown>;
        };
        meta?: { request_id?: string };
      } | null;
      assertCurrent();
      if (controller.signal.aborted)
        throw new ApiError({
          code: "NETWORK_ERROR",
          message: "Máy chủ chưa hoàn tất phản hồi. Vui lòng thử lại.",
          status: 0,
        });
      if (!response.ok) {
        if (response.status === 401 && !credentialEndpoint)
          await options.onExpired?.();
        if (
          response.status === 403 &&
          !credentialEndpoint &&
          path !== "/auth/mobile/me" &&
          (payload?.error?.code === "ACCOUNT_LOCKED" ||
            payload?.error?.code === "EMAIL_NOT_VERIFIED" ||
            (path.startsWith("/admin/") &&
              payload?.error?.code === "FORBIDDEN"))
        ) {
          await options.onForbidden?.().catch(() => undefined);
          assertCurrent();
        }
        throw new ApiError({
          code: payload?.error?.code ?? `HTTP_${response.status}`,
          message: payload?.error?.message ?? "Yêu cầu chưa được thực hiện.",
          status: response.status,
          details: payload?.error?.details,
          requestId: payload?.meta?.request_id,
          fields: payload?.error?.details?.fields as
            | Record<string, string>
            | undefined,
        });
      }
      if (!validApiResponse(path, method, response.status, payload))
        throw new ApiError({
          code: "INVALID_API_RESPONSE",
          message: "Phản hồi máy chủ không hợp lệ.",
          status: 502,
          details: {
            contract: apiResponseIssue(path, method, response.status, payload),
          },
        });
      return resolveMedia(payload!.data, options.baseUrl) as T;
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    get: (path, query) => send("GET", path, undefined, query),
    post: (path, body, query, headers) =>
      send("POST", path, body, query, headers),
    put: (path, body) => send("PUT", path, body),
    patch: (path, body) => send("PATCH", path, body),
    delete: (path) => send("DELETE", path),
  };
}
