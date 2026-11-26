import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addVnd } from "@remarket/shared";
import { api, apiForQuery } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { useSession } from "@/contexts/SessionContext";
import { useConnectivity } from "@/hooks/useConnectivity";
import { invalidateCart } from "@/helpers/cartCache";

/** Carries the selected, available items from the cart to checkout. */
export function useCart() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { viewer } = useSession();
  const online = useConnectivity();
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  useEffect(() => setExcluded(new Set()), [viewer?.id]);

  const cart = useQuery({
    queryKey: queryKeys.cart,
    queryFn: ({ signal }) => apiForQuery(signal).cart.get(),
  });

  const removeItem = useMutation({
    mutationFn: (productId: string) => api.cart.remove(productId),
    onSuccess: async (_, productId) => {
      await invalidateCart(queryClient);
      setProductSelected(productId, true);
    },
  });

  const openChat = useMutation({
    mutationFn: (productId: string) => api.chat.open(productId),
    onSuccess: (conversation) => navigate(`/messages/${conversation.id}`),
  });

  const groups = useMemo(() => cart.data?.groups ?? [], [cart.data?.groups]);

  const availableItems = useMemo(
    () => groups.flatMap((group) => group.items.filter((item) => item.available && !item.unavailable_reason)),
    [groups],
  );
  const selectedItems = availableItems.filter((item) => !excluded.has(item.product_id));
  const selectedIds = selectedItems.map((item) => item.product_id);
  const subtotal = addVnd(...selectedItems.map((item) => item.price));
  const allSelected = availableItems.length > 0 && selectedIds.length === availableItems.length;

  function setProductSelected(productId: string, selected: boolean) {
    setExcluded((previous) => {
      const next = new Set(previous);
      if (selected) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function setAllSelected(selected: boolean) {
    setExcluded(new Set(selected ? [] : availableItems.map((item) => item.product_id)));
  }

  function goToCheckout() {
    if (!online || removeItem.isPending || selectedIds.length === 0) return;
    const params = new URLSearchParams();
    params.set("items", selectedIds.join(","));
    navigate(`/checkout?${params.toString()}`);
  }
  return {
    viewer, online, cart, removeItem, openChat, groups, selectedIds, subtotal, goToCheckout,
    allSelected, availableCount: availableItems.length, setProductSelected, setAllSelected,
  };
}
