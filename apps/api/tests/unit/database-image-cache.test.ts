import { afterEach, describe, expect, it, vi } from "vitest";
import { DatabaseImageCache, databaseImageCache, databaseVariantCacheKey, invalidateDatabaseImage } from "../../src/services/database-image-cache.js";

const image = (size = 4) => ({ contents: Buffer.alloc(size), mimeType: "image/webp" });
afterEach(() => { vi.useRealTimers(); });

describe("bounded database image byte cache", () => {
  it("coalesces simultaneous reads and reuses bytes across different signed URLs", async () => {
    const cache = new DatabaseImageCache();
    const load = vi.fn(async () => image());
    const [a, b] = await Promise.all([cache.read("object", load), cache.read("object", load)]);
    expect(a).toBe(b);
    expect(await cache.read("object", load)).toBe(a);
    expect(load).toHaveBeenCalledOnce();
  });

  it("expires bytes after 60 seconds and absent derivatives after 5 seconds", async () => {
    vi.useFakeTimers();
    const cache = new DatabaseImageCache();
    const present = vi.fn(async () => image());
    const absent = vi.fn(async () => null);
    await cache.read("present", present);
    await cache.read("absent", absent);
    vi.advanceTimersByTime(5_000);
    await cache.read("absent", absent);
    await cache.read("present", present);
    expect(absent).toHaveBeenCalledTimes(2);
    expect(present).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(55_000);
    await cache.read("present", present);
    expect(present).toHaveBeenCalledTimes(2);
  });

  it("evicts least recently used bytes and does not retain oversized objects", async () => {
    const cache = new DatabaseImageCache(8, 2);
    const load = vi.fn(async () => image());
    await cache.read("a", load);
    await cache.read("b", load);
    await cache.read("a", load);
    await cache.read("c", load);
    await cache.read("a", load);
    expect(load).toHaveBeenCalledTimes(3);
    await cache.read("b", load);
    expect(load).toHaveBeenCalledTimes(4);
    const big = vi.fn(async () => image(9));
    await cache.read("big", big);
    await cache.read("big", big);
    expect(big).toHaveBeenCalledTimes(2);
  });

  it("bounds even zero-byte missing entries by entry count", async () => {
    const cache = new DatabaseImageCache(8, 2);
    const absent = vi.fn(async () => null);
    for (const key of ["a", "b", "c", "a"]) await cache.read(key, absent);
    expect(absent).toHaveBeenCalledTimes(4);
  });

  it("does not cache failures", async () => {
    const cache = new DatabaseImageCache();
    const load = vi.fn<() => Promise<ReturnType<typeof image>>>().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValue(image());
    await expect(cache.read("a", load)).rejects.toThrow("unavailable");
    await expect(cache.read("a", load)).resolves.toMatchObject({ mimeType: "image/webp" });
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("invalidation prevents an older read from repopulating a deleted object", async () => {
    const cache = new DatabaseImageCache();
    let finish!: (value: ReturnType<typeof image>) => void;
    const pending = cache.read("a", () => new Promise((resolve) => { finish = resolve; }));
    await Promise.resolve();
    cache.invalidate("a");
    finish(image());
    await pending;
    const current = vi.fn(async () => null);
    expect(await cache.read("a", current)).toBeNull();
    expect(current).toHaveBeenCalledOnce();
  });

  it.each(["original", "derivative"])("invalidates fallback variants after an %s write", async (written) => {
    const path = `test-${written}.png`;
    for (const variant of ["card", "detail"] as const) {
      await databaseImageCache.read(databaseVariantCacheKey(path, variant), async () => image());
    }
    invalidateDatabaseImage(written === "original" ? path : `${path}.card.webp`);
    for (const variant of ["card", "detail"] as const) {
      expect(await databaseImageCache.read(databaseVariantCacheKey(path, variant), async () => null)).toBeNull();
      databaseImageCache.invalidate(databaseVariantCacheKey(path, variant));
    }
  });
});
