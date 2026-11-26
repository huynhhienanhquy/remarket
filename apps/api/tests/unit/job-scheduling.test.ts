import { afterEach, describe, expect, it, vi } from "vitest";

const jobs = vi.hoisted(() => ({
  heartbeat: vi.fn(), orders: vi.fn(), reminders: vi.fn(), uploads: vi.fn(), push: vi.fn(), outbox: vi.fn(), retention: vi.fn(),
}));
vi.mock("../../src/utils/background-prisma.js", () => ({ backgroundPrisma: {
  workerHeartbeat: { upsert: jobs.heartbeat }, order: { findMany: jobs.orders },
  uploadAsset: { findMany: jobs.uploads }, $queryRaw: jobs.reminders,
} }));
vi.mock("../../src/outbox/outbox.js", () => ({ enqueueOutbox: vi.fn(), processOutboxBatch: jobs.outbox }));
vi.mock("../../src/jobs/push.js", () => ({ deliverMobilePush: jobs.push }));
vi.mock("../../src/jobs/retention.js", () => ({ cleanupExpiredRecords: jobs.retention }));
import { startJobRunner } from "../../src/jobs/runner.js";

afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });
describe("independent push scheduling", () => {
  it("sends push while maintenance is blocked and never overlaps a slow push run", async () => {
    vi.useFakeTimers();
    let releaseMaintenance!: () => void, releasePush!: () => void;
    jobs.heartbeat.mockReturnValueOnce(new Promise<void>((resolve) => { releaseMaintenance = resolve; })).mockResolvedValue(undefined);
    jobs.orders.mockResolvedValue([]); jobs.reminders.mockResolvedValue([]); jobs.uploads.mockResolvedValue([]);
    jobs.outbox.mockResolvedValue(0); jobs.retention.mockResolvedValue(undefined);
    jobs.push.mockReturnValueOnce(new Promise<void>((resolve) => { releasePush = resolve; })).mockResolvedValue(undefined);
    const stop = startJobRunner(60_000, 1_000, 5_000);
    try {
      expect(jobs.push).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(jobs.push).toHaveBeenCalledTimes(1);
      expect(jobs.orders).not.toHaveBeenCalled();
      releasePush();
      await vi.advanceTimersByTimeAsync(5_000);
      expect(jobs.push).toHaveBeenCalledTimes(2);
    } finally {
      stop(); releaseMaintenance(); releasePush();
      await vi.advanceTimersByTimeAsync(0);
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});

it("backs off outbox claims after connection timeouts and resumes polling on recovery", async () => {
  vi.useFakeTimers();
  const logError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const logRecovery = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const connectionTimeout = new Error("timeout exceeded when trying to connect");
  jobs.heartbeat.mockResolvedValue(undefined);
  jobs.orders.mockResolvedValue([]);
  jobs.reminders.mockResolvedValue([]);
  jobs.uploads.mockResolvedValue([]);
  jobs.retention.mockResolvedValue(undefined);
  jobs.outbox.mockResolvedValueOnce(0)
    .mockRejectedValueOnce(connectionTimeout)
    .mockRejectedValueOnce(connectionTimeout)
    .mockResolvedValue(0);

  const stop = startJobRunner(60_000, 250);
  try {
    await vi.advanceTimersByTimeAsync(1_249);
    expect(jobs.outbox).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledWith("Outbox pump failed:", connectionTimeout.message);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(jobs.outbox).toHaveBeenCalledTimes(3);
    expect(logRecovery).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(251);
    expect(jobs.outbox).toHaveBeenCalledTimes(5);
    expect(logRecovery).toHaveBeenCalledExactlyOnceWith("Outbox pump recovered.");
  } finally {
    stop();
    logError.mockRestore();
    logRecovery.mockRestore();
  }
});
