import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "../../config/queryClient";
import { member } from "../../tests/test-data";
import { RealtimeProvider } from "../RealtimeContext";

const realtime = vi.hoisted(() => ({
  handlers: new Map<string, () => void>(),
  any: null as ((event: string, payload?: unknown) => void) | null,
  socket: { on: vi.fn(), onAny: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), removeAllListeners: vi.fn() },
  refresh: vi.fn(),
}));
vi.mock("socket.io-client", () => ({ io: () => realtime.socket }));
vi.mock("../SessionContext", () => ({ useSession: () => ({ viewer: member, refresh: realtime.refresh }) }));
vi.mock("../../services/http", () => ({
  http: { getAccessToken: () => "test-access-token" }, subscribeAccessToken: () => () => {},
}));
let client: ReturnType<typeof createQueryClient>;
beforeEach(() => {
  vi.clearAllMocks();
  realtime.handlers.clear();
  realtime.socket.on.mockImplementation((event: string, listener: () => void) => realtime.handlers.set(event, listener));
  realtime.socket.onAny.mockImplementation((listener: (event: string, payload?: unknown) => void) => { realtime.any = listener; });
  client = createQueryClient();
});
afterEach(() => client.clear());

function Probe({ load }: { load: () => Promise<string> }) {
  const query = useQuery({ queryKey: ["products", "initial"], queryFn: load });
  return <div>{query.data ?? "Loading"}</div>;
}
function show(load: () => Promise<string>) {
  render(<QueryClientProvider client={client}><RealtimeProvider><Probe load={load} /></RealtimeProvider></QueryClientProvider>);
}

describe("realtime connection freshness", () => {
  it("renders delivered messages from cache without refetching history or unrelated products", async () => {
    const key = ["chat", "messages", "thread"];
    client.setQueryData(key, { pages: [{ items: [], next_cursor: "older" }], pageParams: [null] });
    const load = vi.fn().mockResolvedValue("Fresh product");
    show(load);
    await screen.findByText("Fresh product");
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const message = { id: "message", sender_id: "seller", client_message_id: "client", content: "Immediate",
      created_at: "2026-10-22T00:00:00.000Z", read_at: null };
    await act(async () => { realtime.any?.("message:created", { conversation_id: "thread", message }); });
    expect(client.getQueryData(key)).toMatchObject({ pages: [{ items: [message], next_cursor: "older" }] });
    expect(invalidate.mock.calls.some(([filter]) => JSON.stringify(filter?.queryKey) === JSON.stringify(key))).toBe(false);
    await act(async () => { realtime.any?.("notification.created", { notification_id: "notification" }); });
    expect(invalidate.mock.calls.filter(([filter]) => JSON.stringify(filter?.queryKey) === '["notifications"]')).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(1);
  });
  it("keeps first-load results, then catches up on reconnects and actual events", async () => {
    const load = vi.fn().mockResolvedValue("Fresh product");
    show(load);
    await screen.findByText("Fresh product");
    await act(async () => { realtime.handlers.get("connect")!(); });
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => { realtime.handlers.get("connect")!(); });
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => { realtime.any?.("order:updated"); });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("revalidates data cached before the initial socket connection", async () => {
    client.setQueryData(["products", "initial"], "Old product");
    const load = vi.fn().mockResolvedValue("Updated product");
    show(load);
    await screen.findByText("Old product");
    expect(load).not.toHaveBeenCalled();
    await act(async () => { realtime.handlers.get("connect")!(); });
    await screen.findByText("Updated product");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not restart the initial request while it is still loading", async () => {
    let finish!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));
    show(load);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => { realtime.handlers.get("connect")!(); finish("Product loaded"); });
    await screen.findByText("Product loaded");
    expect(load).toHaveBeenCalledTimes(1);
  });
});
