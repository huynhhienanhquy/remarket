import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { useUnreadMessageCount } from "./useUnreadMessageCount";

export function useUnreadCounts(enabled: boolean) {
  const messages = useUnreadMessageCount();
  const notifications = useQuery({
    queryKey: queryKeys.unreadCount,
    queryFn: () => api.notifications.unreadCount(),
    enabled,
    staleTime: 15_000,
  });
  const cart = useQuery({
    queryKey: queryKeys.cart,
    queryFn: () => api.cart.get(),
    enabled,
    staleTime: 15_000,
  });
  return {
    messages,
    notifications: notifications.data ?? 0,
    cart: cart.data?.total_items ?? 0,
  };
}
