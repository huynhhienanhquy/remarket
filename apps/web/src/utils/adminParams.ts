/** 1-based page from the URL; anything malformed falls back to 1. */
export function readPage(params: URLSearchParams): number {
  const raw = params.get("page");
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : 1;
}

/** Reads an enum-ish param only when the value is one of `allowed`. */
export function readEnumParam<T extends string>(
  params: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | "" {
  const raw = params.get(key);
  if (raw === null) return "";
  return allowed.find((value) => value === raw) ?? "";
}
