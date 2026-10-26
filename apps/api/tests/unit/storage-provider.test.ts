import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../src/config/env.js", () => ({ env: {
  jwtSecret: "test-only-signing-key-with-more-than-thirty-two-characters",
  storage: { driver: "supabase", signedUrlTtlSeconds: 300, supabaseUrl: "https://storage.example.test", bucket: "private", supabaseServiceRoleKey: "test-only-key" },
} }));
import { assertPrivateSupabaseBucket, createStorageImageReadUrl, createStorageReadUrl, deleteStorageObject, hasSupabaseStorageObject, putStorageObject } from "../../src/services/storage.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
describe("private provider image capabilities", () => {
  it("uploads image bytes to the private bucket without overwriting an object", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const contents = Buffer.from("image");
    await putStorageObject("users/provider-test/product/image.png", contents, "image/png");
    expect(fetch).toHaveBeenCalledWith("https://storage.example.test/storage/v1/object/private/users/provider-test/product/image.png", expect.objectContaining({
      method: "POST", body: contents,
      headers: expect.objectContaining({ "Content-Type": "image/png", "x-upsert": "false", Authorization: "Bearer test-only-key" }),
    }));
  });
  it("accepts a private bucket and rejects public buckets before migration", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({ public: false }))
      .mockResolvedValueOnce(Response.json({ public: true }));
    await assertPrivateSupabaseBucket();
    expect(fetch.mock.calls[0]?.[0]).toBe("https://storage.example.test/storage/v1/bucket/private");
    await expect(assertPrivateSupabaseBucket()).rejects.toThrow("private Supabase bucket");
  });
  it("distinguishes missing objects from authentication failures", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(Response.json({ code: "NoSuchKey" }, { status: 400 }))
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    expect(await hasSupabaseStorageObject("users/provider-test/product/missing.png")).toBe(false);
    expect(fetch.mock.calls[0]?.[0]).toContain("/object/info/authenticated/private/");
    expect(await hasSupabaseStorageObject("users/provider-test/product/missing.png")).toBe(false);
    await expect(hasSupabaseStorageObject("users/provider-test/product/missing.png")).rejects.toThrow("HTTP 401");
  });
  it("single-flights reads for one deadline, preserves remaining TTL and does not reuse expired grants", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-08T00:00:00Z"));
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ signedURL: "/object/sign/private/image?token=test" }), { status: 200 }));
    const path = "users/provider-test/product/cached.png";
    const [a, b] = await Promise.all([createStorageReadUrl(path, 60), createStorageReadUrl(path, 60)]);
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ expiresIn: 60 });
    vi.advanceTimersByTime(20_000);
    await createStorageReadUrl(path, 40);
    expect(fetch).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(41_000);
    await createStorageReadUrl(path, 30);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({ expiresIn: 30 });
  });
  it("falls back to the original for a legacy object without a derivative", async () => {
    const fetch = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ signedURL: "/object/sign/private/original?token=test" }), { status: 200 }));
    const url = await createStorageImageReadUrl("users/provider-test/product/legacy.png", "card", 45);
    expect(url).toContain("/original?token=test");
    expect(String(fetch.mock.calls[0]?.[0])).toContain("legacy.png.card.webp");
    expect(String(fetch.mock.calls[1]?.[0])).toContain("legacy.png");
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({ expiresIn: 45 });
  });
  it("deletes the original and both derivatives together", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 200 }));
    const path = "users/provider-test/product/delete.png";
    await deleteStorageObject(path);
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))).toEqual({ prefixes: [path, `${path}.card.webp`, `${path}.detail.webp`] });
  });
});
