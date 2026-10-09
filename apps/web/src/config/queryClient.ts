export { queryKeys } from "../constants/queryKeys";
import { QueryClient } from "@tanstack/react-query";
import { isNonRetryable } from "../helpers/errors";

/**
 * Server state goes through one query cache (ui-spec 26). 4xx responses are
 * never retried — the request cannot succeed by repeating it — while 5xx and
 * network failures retry twice with the default backoff.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !isNonRetryable(error) && failureCount < 2,
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        throwOnError: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
