import { vi } from "vitest";
import type { SessionUser } from "@remarket/shared";
import { http } from "../services/http";

export interface RecordedRequest {
  method: string;
  path: string;
  url: URL;
  body: unknown;
  headers: Headers;
}
type Handler = (request: RecordedRequest) => unknown | Promise<unknown>;

export function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data, meta: { request_id: "test-request" } }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
}
export function failure(status: number, code: string): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message: "Request rejected" } }), {
    status, headers: { "Content-Type": "application/json" },
  });
}
/** Test-only HTTP responses. No application adapter or in-memory business rules. */
export function httpContext(viewer: SessionUser | null = null) {
  http.setAccessToken(null);
  const handlers = new Map<string, Handler>();
  const context = {
    viewer,
    calls: [] as RecordedRequest[],
    on(method: string, path: string, handler: Handler) { handlers.set(method + " " + path, handler); },
    reply(method: string, path: string, data: unknown) { handlers.set(method + " " + path, () => data); },
    requests(method: string, path: string) { return context.calls.filter((r) => r.method === method && r.path === path); },
  };
  context.on("POST", "/auth/bootstrap", () => ({ user: context.viewer, access_token: context.viewer ? "test-access-token" : null }));
  context.on("GET", "/auth/me", () => context.viewer);
  context.reply("GET", "/provinces", [{ code: "VN-01", name: "Hà Nội" }, { code: "VN-52", name: "Hồ Chí Minh" }]);
  context.reply("GET", "/categories", []);
  context.reply("GET", "/conversations/unread-count", 0);
  vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, options) => {
    const url = new URL(String(input), window.location.origin);
    const request: RecordedRequest = {
      method: options?.method ?? "GET",
      path: url.pathname.replace(/^\/api\/v1/, ""),
      url, body: typeof options?.body === "string" ? JSON.parse(options.body) : options?.body,
      headers: new Headers(options?.headers),
    };
    context.calls.push(request);
    const handler = handlers.get(request.method + " " + request.path);
    if (!handler) throw new Error("Unexpected test request: " + request.method + " " + request.path);
    const result = await handler(request);
    return result instanceof Response ? result : envelope(result);
  }));
  return context;
}
export function page<T>(items: T[]) {
  return { items, meta: { page: 1, page_size: 20, total: items.length, total_pages: items.length ? 1 : 0 } };
}
