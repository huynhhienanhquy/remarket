import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/config/queryClient";

/** Cart mutations refresh both the full cart and the lightweight header count. */
export function invalidateCart(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: queryKeys.cart }),
    client.invalidateQueries({ queryKey: ["notifications", "navigation-counts"] }),
  ]);
}
