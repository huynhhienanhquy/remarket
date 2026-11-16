import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  server: {
    on: vi.fn<(event: string, callback: (error: NodeJS.ErrnoException) => void) => void>(),
    listen: vi.fn<(port: number, host: string, callback: () => void) => void>(),
    close: vi.fn<(callback: () => void) => void>(),
  },
  closeRealtime: vi.fn<() => Promise<void>>(),
  stopRelay: vi.fn(),
  startJobs: vi.fn(),
  disconnect: vi.fn<() => Promise<void>>(),
}));

vi.mock("../../src/config/env.js", () => ({ env: { port: 3000, runJobs: true } }));
vi.mock("node:http", () => ({ createServer: () => state.server }));
vi.mock("../../src/app.js", () => ({ createApp: () => ({}) }));
vi.mock("../../src/utils/prisma.js", () => ({ prisma: {}, warmHttpDatabasePool: async () => undefined }));
vi.mock("../../src/utils/background-prisma.js", () => ({ backgroundPrisma: {} }));
vi.mock("../../src/realtime/server.js", () => ({ attachRealtime: () => ({ close: state.closeRealtime }) }));
vi.mock("../../src/realtime/relay.js", () => ({ startRealtimeRelay: async () => state.stopRelay }));
vi.mock("../../src/jobs/runner.js", () => ({ startJobRunner: state.startJobs }));
vi.mock("../../src/utils/database-client.js", () => ({ disconnectDatabaseClient: state.disconnect }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.useFakeTimers();
  state.closeRealtime.mockResolvedValue(undefined);
  state.disconnect.mockResolvedValue(undefined);
  state.server.close.mockImplementation(callback => callback());
  state.startJobs.mockReturnValue(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(process, "on").mockReturnValue(process);
  vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("HTTP startup", () => {
  it("reports an occupied port and closes resources without starting jobs", async () => {
    await import("../../src/index.js");
    const errorHandler = state.server.on.mock.calls.find(([event]) => event === "error")?.[1];
    expect(errorHandler).toBeDefined();
    errorHandler?.(Object.assign(new Error("Port in use"), { code: "EADDRINUSE" }));
    await vi.waitFor(() => expect(process.exit).toHaveBeenCalledWith(1));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("cổng 3000 đang được sử dụng"));
    expect(state.startJobs).not.toHaveBeenCalled();
    expect(state.stopRelay).toHaveBeenCalledOnce();
    expect(state.closeRealtime).toHaveBeenCalledOnce();
    expect(state.disconnect).toHaveBeenCalledTimes(2);
  });

  it("starts jobs only after the HTTP listener is ready", async () => {
    await import("../../src/index.js");
    expect(state.startJobs).not.toHaveBeenCalled();
    expect(state.server.listen).toHaveBeenCalledWith(3000, "0.0.0.0", expect.any(Function));
    state.server.listen.mock.calls[0]?.[2]();
    expect(state.startJobs).toHaveBeenCalledOnce();
  });
});
