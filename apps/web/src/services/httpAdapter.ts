import type { ApiAdapter } from "../types/api";
import { createAuthEndpoints } from "./endpoints/auth";
import { catalogEndpoints, commerceEndpoints, communicationEndpoints, adminEndpoints } from "@remarket/api-client";
import { http } from "./http";

export function createHttpAdapter(signal?: AbortSignal): ApiAdapter {
  const transport: typeof http = signal ? {
    ...http,
    get: (path, query) => http.get(path, query, signal),
  } : http;
  return {
    auth: createAuthEndpoints(transport),
    ...catalogEndpoints(transport),
    ...commerceEndpoints(transport),
    ...communicationEndpoints(transport),
    admin: adminEndpoints(transport),
  };
}
