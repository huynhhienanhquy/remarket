import type { QueryClient } from "@tanstack/react-query";

/** Preserve first-load requests; refresh cached data and catch up after reconnects. */
export function createConnectionRecovery(client: QueryClient): () => void {
  const cached = new Map(client.getQueryCache().getAll()
    .filter((query) => query.state.dataUpdatedAt > 0)
    .map((query) => [query.queryHash, query.state.dataUpdatedAt]));
  let connectedOnce = false;
  return () => {
    if (connectedOnce) void client.invalidateQueries();
    else void client.invalidateQueries({
      predicate: (query) => cached.get(query.queryHash) === query.state.dataUpdatedAt,
    }, { cancelRefetch: false });
    connectedOnce = true;
  };
}
