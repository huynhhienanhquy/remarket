import { useNavigationCounts } from "./useNavigationCounts";

export function useUnreadCounts(enabled: boolean) {
  const counts = useNavigationCounts(enabled);
  return {
    messages: counts.data?.messages ?? 0,
    notifications: counts.data?.notifications ?? 0,
    cart: counts.data?.cart ?? 0,
  };
}
