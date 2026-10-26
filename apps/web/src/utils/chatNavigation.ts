/** Accept only an internal admin location, including its filters and selection. */
export function adminChatReturnPath(value: string | null): string | null {
  if (!value || !/^\/admin(?:\/|\?|#|$)/.test(value)) return null;
  try {
    const url = new URL(value, "http://remarket.internal");
    if (url.origin !== "http://remarket.internal" || !/^\/admin(?:\/|$)/.test(url.pathname)) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return null; }
}
