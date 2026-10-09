import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addVnd } from "@remarket/shared";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { useSession } from "@/contexts/SessionContext";
import { useConnectivity } from "@/hooks/useConnectivity";

/**
 * Owns cart selection and totals; only available items enter the existing checkout URL.
 * Called once by the route component; hook order and handlers match the original page.
 */
export function useCart() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { viewer: _viewer } = useSession();
  const online = useConnectivity();

  const cart = useQuery({
    queryKey: queryKeys.cart,
    queryFn: () => api.cart.get(),
  });

  const removeItem = useMutation({
    mutationFn: (productId: string) => api.cart.remove(productId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.cart }),
  });

  const groups = useMemo(() => cart.data?.groups ?? [], [cart.data?.groups]);

  const selectedIds = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items
          .filter((item) => item.available && !item.unavailable_reason)
          .map((item) => item.product_id),
      ),
    [groups],
  );

  const subtotal = useMemo(() => {
    const prices: string[] = [];
    for (const group of groups) {
      for (const item of group.items) {
        if (item.available && !item.unavailable_reason) {
          prices.push(item.price);
        }
      }
    }
    return addVnd(...prices);
  }, [groups]);

  function goToCheckout() {
    if (selectedIds.length === 0) return;
    const params = new URLSearchParams();
    params.set("items", selectedIds.join(","));
    navigate(`/checkout?${params.toString()}`);
  }
  return { online, cart, removeItem, groups, selectedIds, subtotal, goToCheckout };
}
