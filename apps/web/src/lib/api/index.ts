import { API_MODE } from "../env";
import { createMockAdapter } from "../../mocks/adapter";
import { createHttpAdapter } from "./httpAdapter";
import type { ApiAdapter } from "./contract";

/**
 * The session uses exactly one adapter (ui-spec 1): mock fixtures or the live
 * API, never both. `VITE_API_MODE=live` switches to the REST transport.
 */
export const api: ApiAdapter =
  API_MODE === "live" ? createHttpAdapter() : createMockAdapter();

export type { ApiAdapter } from "./contract";
export { SESSION_EXPIRED_EVENT, http } from "./http";
