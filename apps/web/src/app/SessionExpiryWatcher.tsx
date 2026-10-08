import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { SESSION_EXPIRED_EVENT } from "../lib/api";
import { useSession } from "./SessionProvider";
import { loginPathFor } from "./guards";

/**
 * Single reaction point for a failed refresh (ui-spec 24): drop private cache,
 * clear the session and return the user to login with a safe `returnTo`.
 */
export function SessionExpiryWatcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { expire, status } = useSession();

  useEffect(() => {
    function onExpired() {
      queryClient.clear();
      expire();
      if (status === "ready") {
        navigate(loginPathFor(location.pathname, location.search), { replace: true });
      }
    }
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [queryClient, expire, navigate, location.pathname, location.search, status]);

  return null;
}
