import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createConnectionRecovery } from "./query-recovery";

const clients: QueryClient[] = [];
function client() {
  const result = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  clients.push(result);
  return result;
}
afterEach(() => clients.splice(0).forEach((value) => value.clear()));

describe("socket query recovery", () => {
  it("keeps freshly loaded results on first connect and refreshes them on reconnect", async () => {
    const cache = client();
    const connect = createConnectionRecovery(cache);
    const load = vi.fn().mockResolvedValue("fresh");
    const query = new QueryObserver(cache, { queryKey: ["products"], queryFn: load });
    const unsubscribe = query.subscribe(() => {});
    await vi.waitFor(() => expect(query.getCurrentResult().data).toBe("fresh"));
    connect();
    expect(load).toHaveBeenCalledTimes(1);
    connect();
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    unsubscribe();
  });

  it("refreshes data that was already cached before the connection", async () => {
    const cache = client();
    cache.setQueryData(["products"], "old");
    const connect = createConnectionRecovery(cache);
    const load = vi.fn().mockResolvedValue("updated");
    const query = new QueryObserver(cache, { queryKey: ["products"], queryFn: load });
    const unsubscribe = query.subscribe(() => {});
    expect(load).not.toHaveBeenCalled();
    connect();
    await vi.waitFor(() => expect(query.getCurrentResult().data).toBe("updated"));
    expect(load).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("does not cancel and restart an in-flight request during the handshake", async () => {
    const cache = client();
    cache.setQueryData(["products"], "old");
    const connect = createConnectionRecovery(cache);
    let finish!: (value: string) => void;
    const load = vi.fn(({ signal }: { signal: AbortSignal }) => {
      expect(signal.aborted).toBe(false);
      return new Promise<string>((resolve) => { finish = resolve; });
    });
    const pending = cache.fetchQuery({ queryKey: ["products"], queryFn: load, staleTime: 0 });
    const query = new QueryObserver(cache, { queryKey: ["products"], queryFn: load });
    const unsubscribe = query.subscribe(() => {});
    connect();
    expect(load).toHaveBeenCalledTimes(1);
    finish("updated");
    await expect(pending).resolves.toBe("updated");
    expect(query.getCurrentResult().data).toBe("updated");
    unsubscribe();
  });
});
