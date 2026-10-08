/** Reserved documentation hosts are not real listing images. Keep stored rows intact. */
export function usableImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, "http://remarket.internal");
    if (/^(?:.*\.)?example\.(?:com|org|net)$/i.test(parsed.hostname)) return null;
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return url;
  } catch { return null; }
}
