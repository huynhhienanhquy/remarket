/**
 * Deterministic clock for fixtures: everything is derived from process start
 * so relative labels ("2 giờ trước") and expiry countdowns stay believable.
 */
const NOW = Date.now();

export function ago(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

export function ahead(minutes: number): string {
  return new Date(NOW + minutes * 60_000).toISOString();
}

export function daysAgo(days: number): string {
  return ago(days * 24 * 60);
}

export function daysAhead(days: number): string {
  return ahead(days * 24 * 60);
}

/** Deterministic UUID-shaped id: class digit + stable counter. */
export function uid(className: number, index: number): string {
  const tail = index.toString(16).padStart(12, "0");
  return `0000000${className.toString(16)}-0000-4000-8000-${tail}`;
}

export const IDS = {
  user: (n: number) => uid(1, n),
  category: (n: number) => uid(2, n),
  product: (n: number) => uid(3, n),
  order: (n: number) => uid(4, n),
  conversation: (n: number) => uid(5, n),
  message: (n: number) => uid(6, n),
  ticket: (n: number) => uid(7, n),
  report: (n: number) => uid(8, n),
  review: (n: number) => uid(9, n),
  notification: (n: number) => uid(10, n),
  checkout: (n: number) => uid(11, n),
} as const;

/** Short human order code shown as "Đơn #8F2K1A9C". */
export function orderCode(seed: string): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  for (let i = 0; i < 8; i += 1) {
    out += alphabet[hash % alphabet.length];
    hash = Math.floor(hash / alphabet.length) + 7;
  }
  return out;
}
