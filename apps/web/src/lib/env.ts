/**
 * Runtime configuration. `VITE_*` variables are public build-time values and
 * must never contain secrets (detail-project 18.1).
 */
export type ApiMode = "mock" | "live";

const rawMode = import.meta.env.VITE_API_MODE as string | undefined;

/** Single adapter per session: mock and live data are never mixed (ui-spec 1). */
export const API_MODE: ApiMode = rawMode === "live" ? "live" : "mock";

export const IS_MOCK: boolean = API_MODE === "mock";

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api/v1";

export const SOCKET_URL: string =
  (import.meta.env.VITE_SOCKET_URL as string | undefined) ?? "";

/** Label rendered on fixture-driven screens so demo data is never mistaken live. */
export const DEMO_BANNER = IS_MOCK;
