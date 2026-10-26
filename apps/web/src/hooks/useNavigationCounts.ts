import { useQuery } from "@tanstack/react-query";
import { apiForQuery } from "@/services/api";
import { queryKeys } from "@/config/queryClient";
import { useSession } from "@/contexts/SessionContext";

/** Shared chrome loads counts once; realtime and cart actions invalidate them. */
export function useNavigationCounts(enabled = true) {
  const { viewer } = useSession();
  return useQuery({
    queryKey: queryKeys.navigationCounts(viewer?.id ?? ""),
    queryFn: ({ signal }) => apiForQuery(signal).notifications.navigationCounts(),
    enabled: enabled && !!viewer,
    staleTime: Infinity,
    refetchOnReconnect: "always",
  });
}
