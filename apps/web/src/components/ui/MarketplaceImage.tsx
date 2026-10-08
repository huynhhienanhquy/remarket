import { useState } from "react";
import type { ImgHTMLAttributes } from "react";
import { ImageIcon } from "./icons";
import { ApiImage } from "./ApiImage";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet" | "onError"> & {
  src: string;
  variant?: "original" | "card" | "detail";
};

export function imageVariantUrl(src: string, variant: "original" | "card" | "detail"): string {
  try {
    const url = new URL(src, "http://remarket.internal");
    if (!/^\/api\/v1\/uploads\//.test(url.pathname) || !url.searchParams.has("resource") || !url.searchParams.has("signature")) return src;
    url.searchParams.set("variant", variant);
    return src.startsWith("/") ? `${url.pathname}${url.search}` : url.toString();
  } catch { return src; }
}

function ImageContent({ src, variant = "original", alt = "", className, ...props }: Props) {
  const [state, setState] = useState<"variant" | "original" | "failed">("variant");
  const candidate = imageVariantUrl(src, variant);
  const shown = state === "original" ? src : candidate;
  let reservedHost = false;
  try { reservedHost = /^(?:.*\.)?example\.(?:com|org|net)$/i.test(new URL(src, "http://remarket.internal").hostname); } catch { /* img handles invalid URLs */ }
  if (!src || state === "failed" || reservedHost) return <span role="img" aria-label={alt || "Ảnh không khả dụng"}
    className={`inline-flex items-center justify-center bg-surface-subtle text-muted ${className ?? ""}`}><ImageIcon size={28} /></span>;
  return <ApiImage {...props} src={shown} alt={alt} className={className} decoding="async"
    onError={() => setState(state === "variant" && candidate !== src ? "original" : "failed")} />;
}

/** Retry the original once if a derivative is absent, then show a stable placeholder. */
export function MarketplaceImage(props: Props) {
  return <ImageContent key={`${props.src}:${props.variant}`} {...props} />;
}
