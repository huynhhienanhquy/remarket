import { createHttpAdapter } from "./httpAdapter";
import type { ApiAdapter } from "../types/api";

/** All application data comes from the REST API. */
export const api: ApiAdapter = createHttpAdapter();

export type { ApiAdapter } from "../types/api";
export { SESSION_EXPIRED_EVENT, http } from "./http";
