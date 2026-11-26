import { afterEach, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({}));

const renderApiUrl = "https://remarket.onrender.com/api/v1";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

it("loads the catalog after a slow Render startup", async () => {
  vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", renderApiUrl);
  const requestFetch = vi.fn<typeof fetch>((_url, options) =>
    new Promise((resolve, reject) => {
      const response = setTimeout(() => {
        resolve(Response.json({
          success: true,
          data: [],
          meta: { request_id: "req-catalog" },
        }));
      }, 55_000);
      options?.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(response);
          reject(options.signal?.reason);
        },
        { once: true },
      );
    }),
  );
  vi.stubGlobal("fetch", requestFetch);
  const { api } = await import("./runtime");
  vi.useFakeTimers();

  const result = expect(api.categories.tree()).resolves.toEqual([]);
  await vi.advanceTimersByTimeAsync(55_000);
  await result;
  expect(requestFetch).toHaveBeenCalledTimes(1);
});

it.each([
  ["Render session restore", "/auth/mobile/bootstrap", "POST", 75_000],
  ["Render session refresh", "/auth/mobile/refresh", "POST", 75_000],
  ["Render catalog", "/categories", "GET", 75_000],
  ["Render mutation", "/cart", "POST", 20_000],
  ["local catalog", "/categories", "GET", 20_000, "http://localhost:3000/api/v1"],
] as const)("bounds the wait for %s", async (_label, path, method, timeout, baseUrl: string = renderApiUrl) => {
  vi.stubEnv("EXPO_PUBLIC_API_BASE_URL", baseUrl);
  const requestFetch = vi.fn<typeof fetch>((_url, options) =>
    new Promise((_resolve, reject) => {
      options?.signal?.addEventListener(
        "abort",
        () => reject(options.signal?.reason),
        { once: true },
      );
    }),
  );
  vi.stubGlobal("fetch", requestFetch);
  const { http } = await import("./runtime");
  vi.useFakeTimers();

  const request = method === "GET" ? http.get(path) : http.post(path);
  const result = expect(request).rejects.toMatchObject({
    code: "NETWORK_ERROR",
    message: "Máy chủ phản hồi quá lâu. Vui lòng thử lại.",
  });
  await vi.advanceTimersByTimeAsync(timeout - 1);
  expect(requestFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  await result;
});
