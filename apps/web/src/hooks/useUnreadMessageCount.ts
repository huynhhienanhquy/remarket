import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/contexts/SessionContext";
import { queryKeys } from "@/config/queryClient";
import { api } from "@/services/api";

/** Header and mobile navigation share one viewer-scoped count. */
export function useUnreadMessageCount() {
  const { viewer } = useSession();
  const enabled = viewer?.status === "ACTIVE";
  const query = useQuery({
    queryKey: queryKeys.chatUnreadCount(viewer?.id ?? ""),
    queryFn: () => api.chat.unreadCount(),
    enabled,
    staleTime: 15_000,
    // Keep the count current while a socket is unavailable; hidden/offline tabs pause.
    refetchInterval: 30_000,
  });
  return enabled ? query.data ?? 0 : 0;
}
