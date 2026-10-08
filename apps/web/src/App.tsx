import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "./app/SessionProvider";
import { AppRouter } from "./app/router";
import { createQueryClient } from "./lib/queryClient";

const queryClient = createQueryClient();

/**
 * Provider order: one query cache for the session, then the session itself so
 * guards can read it during the initial check, then the router (ui-spec 26).
 * Toast/session-expiry providers live inside the router because they render
 * <Link>; see `RootLayout` in app/router.tsx.
 */
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <AppRouter />
      </SessionProvider>
    </QueryClientProvider>
  );
}
