import { useRef, useState } from "react";
import { Image } from "expo-image";
import type { ImageProps } from "expo-image";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL, http, session } from "../services/runtime";

/** One recovery per attachment, including an owner preview whose signature expired. */
export function MarketplaceImage({
  uri,
  ...props
}: Omit<ImageProps, "source" | "onError"> & { uri: string }) {
  const recovered = useRef<string | null>(null);
  const [fallback, setFallback] = useState<{
    source: string;
    url: string;
  } | null>(null);
  const client = useQueryClient();
  const token = session.getToken();
  let attachment = uri;
  try {
    const location = new URL(uri);
    attachment = location.origin + location.pathname;
  } catch {
    // Invalid URLs still get only one recovery attempt.
  }
  return (
    <Image
      {...props}
      source={{ uri: fallback?.source === uri ? fallback.url : uri }}
      onError={() => {
        if (recovered.current === attachment) return;
        recovered.current = attachment;
        void client.invalidateQueries({
          predicate: (query) =>
            [
              "products",
              "favorites",
              "cart",
              "checkout",
              "orders",
              "profiles",
              "admin",
            ].includes(String(query.queryKey[0])),
        });
        try {
          const url = new URL(uri);
          const filename = url.pathname.split("/").at(-1);
          if (
            token &&
            filename &&
            url.origin === new URL(API_URL).origin &&
            url.pathname.startsWith("/api/v1/uploads/")
          ) {
            // REST rechecks ownership and returns a fresh capability; images never carry JWT headers to redirects/CDNs.
            void http
              .get<{ url: string }>(`/uploads/${filename}/preview-url`)
              .then((data) => setFallback({ source: uri, url: data.url }))
              .catch(() => undefined);
          }
        } catch {
          /* A malformed image URL still falls back to metadata refetch once. */
        }
      }}
    />
  );
}
