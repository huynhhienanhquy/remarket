import { useSession } from "@/contexts/SessionContext";
import { useNavigationCounts } from "./useNavigationCounts";

/** Header and mobile navigation share one viewer-scoped count. */
export function useUnreadMessageCount() {
  const { viewer } = useSession();
  const enabled = viewer?.status === "ACTIVE";
  const query = useNavigationCounts();
  return enabled ? query.data?.messages ?? 0 : 0;
}
