import { useQuery } from "@tanstack/react-query";
import { api } from "./runtime";
import { useSession } from "./session-context";

/** Header and tab bar share one request instead of loading the full cart. */
export function useNavigationCounts() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["notifications", "navigation-counts", user?.id],
    queryFn: api.notifications.navigationCounts,
    enabled: !!user,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
