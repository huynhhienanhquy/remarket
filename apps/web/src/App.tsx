import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "./contexts/SessionContext";
import { AppRouter } from "./config/route/router";
import { createQueryClient } from "./config/queryClient";
import { RealtimeProvider } from "./contexts/RealtimeContext";

const queryClient = createQueryClient();

/**
 * Provider order: one query cache for the session, then the session itself so
 * guards can read it during the initial check, then the router (ui-spec 26).
 * Toast/session-expiry providers live inside the router because they render
 * <Link>; see `RootLayout` in layouts/RootLayout/RootLayout.tsx.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RealtimeProvider><AppRouter /></RealtimeProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
