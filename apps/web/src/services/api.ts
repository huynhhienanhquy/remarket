import { createHttpAdapter } from "./httpAdapter";
import type { ApiAdapter } from "../types/api";

/** All application data comes from the REST API. */
export const api: ApiAdapter = createHttpAdapter();

/** Reads belong to their mounted query; leaving the page aborts its requests. */
export function apiForQuery(signal: AbortSignal): ApiAdapter {
  return createHttpAdapter(signal);
}

export type { ApiAdapter } from "../types/api";
export { SESSION_EXPIRED_EVENT, http } from "./http";
