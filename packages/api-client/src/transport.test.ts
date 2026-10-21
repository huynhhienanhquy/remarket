import { describe, expect, it, vi } from "vitest";
import { createTransport, mediaUrl } from "./transport.js";

describe("platform-neutral HTTP", () => {
  it("refreshes identity after losing admin rights without repeating the mutation", async () => {
    const onForbidden = vi.fn(async () => undefined);
    const refresh = vi.fn(async () => true);
    const requestFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: "FORBIDDEN", message: "Không có quyền quản trị." },
          }),
          { status: 403 },
        ),
    );
    const http = createTransport({
      baseUrl: "https://api.example.test/api/v1",
      fetch: requestFetch,
      onForbidden,
      refresh,
    });
    await expect(
      http.post("/admin/products/id/approve", { expected_version: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(onForbidden).toHaveBeenCalledTimes(1);
    expect(refresh).not.toHaveBeenCalled();
    expect(requestFetch).toHaveBeenCalledTimes(1);
  });
  it("times out a response body that stalls after HTTP headers have arrived", async () => {
    const requestFetch = vi.fn<typeof fetch>(
      async (_url, options) =>
        new Response(
          new ReadableStream({
            start(controller) {
              options?.signal?.addEventListener("abort", () =>
                controller.error(new Error("aborted")),
              );
            },
          }),
          { status: 200 },
        ),
    );
    const http = createTransport({
      baseUrl: "https://api.example.test/api/v1",
      fetch: requestFetch,
      timeoutMs: 20,
    });
    await expect(http.get("/conversations/unread-count")).rejects.toMatchObject(
      { code: "NETWORK_ERROR", status: 0 },
    );
  });
  it("resolves upload paths using the API host", () => {
    expect(
      mediaUrl(
        "/api/v1/uploads/a.jpg?sig=abc",
        "https://api.example.test/api/v1",
      ),
    ).toBe("https://api.example.test/api/v1/uploads/a.jpg?sig=abc");
    expect(
      mediaUrl(
        "https://storage.example.test/a.jpg",
        "https://api.example.test/api/v1",
      ),
    ).toBe("https://storage.example.test/a.jpg");
  });
  it("rejects private results received after the account generation changed", async () => {
    let generation = 1;
    const requestFetch = vi.fn<typeof fetch>(async () => {
      generation = 2;
      return new Response(
        JSON.stringify({ success: true, data: 4, meta: { request_id: "id" } }),
        { status: 200 },
      );
    });
    const http = createTransport({
      baseUrl: "https://api.example.test/api/v1",
      fetch: requestFetch,
      getGeneration: () => generation,
    });
    await expect(http.get("/conversations/unread-count")).rejects.toMatchObject(
      { code: "SESSION_CHANGED" },
    );
  });
  it("does not forward cookie credentials and preserves the checkout idempotency key", async () => {
    const requestFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "PRICE_CHANGED", message: "price changed" },
          }),
          { status: 409 },
        ),
    );
    const http = createTransport({
      baseUrl: "https://api.example.test/api/v1",
      fetch: requestFetch,
      getToken: () => "access",
    });
    await expect(
      http.post("/checkout", { items: [] }, undefined, {
        "Idempotency-Key": "stable-key",
      }),
    ).rejects.toMatchObject({ code: "PRICE_CHANGED" });
    expect(requestFetch.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
      headers: {
        Authorization: "Bearer access",
        "Idempotency-Key": "stable-key",
      },
    });
  });
  it("does not retry a forbidden mutation", async () => {
    const refresh = vi.fn();
    const requestFetch = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "EMAIL_NOT_VERIFIED", message: "verify" },
          }),
          { status: 403 },
        ),
    );
    const http = createTransport({
      baseUrl: "https://api.example.test/api/v1",
      fetch: requestFetch,
      refresh,
    });
    await expect(http.post("/products", {})).rejects.toMatchObject({
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(requestFetch).toHaveBeenCalledTimes(1);
  });
});
