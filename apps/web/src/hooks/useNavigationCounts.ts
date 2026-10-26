import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { useSession } from "@/contexts/SessionContext";

/** All mounted navigation surfaces share one request and one viewer-scoped cache. */
export function useNavigationCounts(enabled = true) {
  const { viewer } = useSession();
  return useQuery({
    queryKey: queryKeys.navigationCounts(viewer?.id ?? ""),
    queryFn: () => api.notifications.navigationCounts(),
    enabled: enabled && !!viewer,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
