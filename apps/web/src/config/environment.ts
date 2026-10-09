/**
 * Runtime configuration. `VITE_*` variables are public build-time values and
 * must never contain secrets (detail-project 18.1).
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

export const SOCKET_URL: string =
  (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? "";
