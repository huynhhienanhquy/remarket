/** Process-local sliding window. All transports of an action share one store. */
export class RateQuota {
  private readonly entries = new Map<string, number[]>();
  private nextCleanup = 0;

  constructor(readonly windowMs: number, readonly limit: number) {}

  get size(): number { return this.entries.size; }

  consume(key: string, now = Date.now()): { allowed: boolean; remaining: number; retryAfter: number } {
    // Run before every branch, including new identities and expired windows.
    if (now >= this.nextCleanup) {
      for (const [id, stamps] of this.entries) {
        if ((stamps.at(-1) ?? 0) <= now - this.windowMs) this.entries.delete(id);
      }
      this.nextCleanup = now + Math.min(this.windowMs, 60_000);
    }
    const recent = (this.entries.get(key) ?? []).filter((stamp) => stamp > now - this.windowMs);
    const allowed = recent.length < this.limit;
    if (allowed) recent.push(now);
    this.entries.set(key, recent);
    return {
      allowed,
      remaining: Math.max(0, this.limit - recent.length),
      retryAfter: Math.max(1, Math.ceil(((recent[0] ?? now) + this.windowMs - now) / 1000)),
    };
  }
}

export const chatQuota = new RateQuota(60_000, 30);
