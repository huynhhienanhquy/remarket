import type { ImgHTMLAttributes } from "react";
import { API_BASE_URL } from "../../lib/env";

/** Opt API uploads into the existing CORS allowlist; keep other hosts unchanged. */
export function apiImageCrossOrigin(src: string | undefined, apiBase = API_BASE_URL): "anonymous" | undefined {
  if (!src) return undefined;
  try {
    const api = new URL(apiBase, window.location.origin);
    const image = new URL(src, window.location.origin);
    const uploadPrefix = `${api.pathname.replace(/\/$/, "")}/uploads/`;
    return image.origin === api.origin && image.pathname.startsWith(uploadPrefix) ? "anonymous" : undefined;
  } catch { return undefined; }
}

/** Signed URLs need no credentials; CORS mode avoids CORP's no-cors block. */
export function ApiImage({ src, crossOrigin, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img {...props} crossOrigin={crossOrigin ?? apiImageCrossOrigin(src)} src={src} />;
}
