import type { PrismaClient } from "@prisma/client";
import { afterEach, expect, it, vi } from "vitest";
import { publishRealtimeEvent } from "../../src/realtime/events.js";
import { startRealtimeRelay } from "../../src/realtime/relay.js";

vi.mock("../../src/utils/prisma.js", () => ({ prisma: {} }));
vi.mock("../../src/utils/background-prisma.js", () => ({ backgroundPrisma: {} }));
vi.mock("../../src/realtime/events.js", () => ({ publishRealtimeEvent: vi.fn() }));

const connectionReset = Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("retries a reset immediately and publishes events from a committed outbox batch once", async () => {
  vi.useFakeTimers();
  const event = { eventType: "chat.message.created", aggregateId: "message-id", payload: {} };
  const query = vi.fn()
    .mockRejectedValueOnce(connectionReset)
    .mockResolvedValueOnce([{ sequence: 0n }])
    .mockResolvedValueOnce([{ ...event, id: "outbox-id", relaySequence: 1n }])
    .mockResolvedValue([]);
  const execute = vi.fn()
    .mockRejectedValueOnce(new Error("Invalid `prisma.$executeRaw()` invocation:\n\nread ECONNRESET"))
    .mockResolvedValue(0);
  const client = { $queryRaw: query, $executeRaw: execute } as unknown as PrismaClient;
  const stop = await startRealtimeRelay(1_000, client);
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(publishRealtimeEvent).toHaveBeenCalledExactlyOnceWith(event);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(query.mock.lastCall?.[1]).toBe(1n);
    expect(publishRealtimeEvent).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});

it("backs off when the replacement connection also resets", async () => {
  vi.useFakeTimers();
  const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const logRecovery = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const query = vi.fn().mockResolvedValueOnce([{ sequence: 0n }]).mockResolvedValue([]);
  const execute = vi.fn()
    .mockRejectedValueOnce(connectionReset)
    .mockRejectedValueOnce(connectionReset)
    .mockResolvedValue(0);
  const client = { $queryRaw: query, $executeRaw: execute } as unknown as PrismaClient;
  const stop = await startRealtimeRelay(250, client);
  try {
    await vi.advanceTimersByTimeAsync(999);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(logRecovery).toHaveBeenCalledTimes(1);
  } finally {
    stop();
  }
});
