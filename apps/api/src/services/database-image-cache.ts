import type { StorageImage } from "./storage.js";

/** Bytes only: callers must authorize every request before using this cache. */
export class DatabaseImageCache {
  private readonly entries = new Map<string, { image: StorageImage | null; expiresAt: number; size: number }>();
  private readonly pending = new Map<string, Promise<StorageImage | null>>();
  private bytes = 0;

  constructor(
    private readonly maxBytes = 32 * 1024 * 1024,
    private readonly maxEntries = 128,
    private readonly ttlMs = 60_000,
  ) {}

  invalidate(path: string): void {
    const entry = this.entries.get(path);
    if (entry) this.bytes -= entry.size;
    this.entries.delete(path);
    // An earlier in-flight read must not repopulate a deleted/replaced object.
    this.pending.delete(path);
  }

  async read(path: string, load: () => Promise<StorageImage | null>): Promise<StorageImage | null> {
    const now = Date.now();
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.invalidate(key);
    const cached = this.entries.get(path);
    if (cached) {
      this.entries.delete(path);
      this.entries.set(path, cached);
      return cached.image;
    }
    const running = this.pending.get(path);
    if (running) return running;
    // Keep bookkeeping bounded even under requests for many distinct objects.
    if (this.pending.size >= this.maxEntries) return load();
    const work = Promise.resolve().then(load).then((image) => {
      const size = image?.contents.byteLength ?? 0;
      if (this.pending.get(path) !== work || size > this.maxBytes) return image;
      while (this.entries.size >= this.maxEntries || this.bytes + size > this.maxBytes) {
        const oldest = this.entries.keys().next().value;
        if (oldest === undefined) break;
        this.invalidate(oldest);
      }
      // Briefly remember absent legacy derivatives to avoid a second DB query
      // for each card. New uploads/deletes invalidate their paths immediately.
      this.entries.set(path, { image, size, expiresAt: Date.now() + (image ? this.ttlMs : Math.min(this.ttlMs, 5_000)) });
      this.bytes += size;
      return image;
    }).finally(() => {
      if (this.pending.get(path) === work) this.pending.delete(path);
    });
    this.pending.set(path, work);
    return work;
  }
}

export const databaseImageCache = new DatabaseImageCache();

export function databaseVariantCacheKey(storagePath: string, variant: "card" | "detail"): string {
  return `${storagePath}\0${variant}`;
}

/** A variant cache entry may contain fallback original bytes. Any write to
 * either object must invalidate those dependent results as well. */
export function invalidateDatabaseImage(storagePath: string): void {
  databaseImageCache.invalidate(storagePath);
  const original = storagePath.replace(/\.(card|detail)\.webp$/, "");
  for (const variant of ["card", "detail"] as const) {
    databaseImageCache.invalidate(databaseVariantCacheKey(original, variant));
  }
}
