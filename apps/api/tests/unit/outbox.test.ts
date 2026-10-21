import type { Prisma, PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { enqueueOutbox, processOutboxBatch } from "../../src/outbox/outbox.js";

describe("durable outbox deduplication", () => {
  it("inserts with database deduplication without replacing existing payload/state", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = { outboxDedupeKey: { createManyAndReturn: vi.fn().mockImplementation(async ({ data }: { data: Array<{ dedupeKey: string }> }) => data) }, outboxEvent: { createMany } } as unknown as Prisma.TransactionClient;
    await enqueueOutbox(tx, "session.revoked", "session", "revoked:session", { session_ids: ["session"] });
    expect(createMany).toHaveBeenCalledExactlyOnceWith({
      data: [{ eventType: "session.revoked", aggregateId: "session", dedupeKey: "revoked:session", payload: { session_ids: ["session"] } }],
      skipDuplicates: true,
    });
  });
  it("propagates an insert failure so the surrounding business transaction rolls back", async () => {
    const failure = new Error("database unavailable");
    const tx = { outboxDedupeKey: { createManyAndReturn: vi.fn().mockImplementation(async ({ data }: { data: Array<{ dedupeKey: string }> }) => data) }, outboxEvent: { createMany: vi.fn().mockRejectedValue(failure) } } as unknown as Prisma.TransactionClient;
    await expect(enqueueOutbox(tx, "session.revoked", "session", "revoked:session", {})).rejects.toBe(failure);
  });
});

describe("outbox worker leases", () => {
  afterEach(() => vi.useRealTimers());

  function workers() {
    const rows = ["a", "b"].map((id) => ({
      id, aggregateId: id, eventType: "test", payload: {}, attempts: 0,
      lockId: null as string | null, lockedAt: null as Date | null, processedAt: null as Date | null,
    }));
    const client = {
      $queryRaw: vi.fn(async (_sql, _maxAttempts, staleBefore: Date, batchSize: number, lockId: string) => {
        const claimed = rows.filter((row) => !row.processedAt && (!row.lockedAt || row.lockedAt < staleBefore)).slice(0, batchSize);
        for (const row of claimed) { row.lockId = lockId; row.lockedAt = new Date(); }
        return claimed.map((row) => ({ ...row }));
      }),
      outboxEvent: { updateMany: vi.fn(async ({ where, data }) => {
        const owned = rows.filter((row) => (!where.id || row.id === where.id) && row.lockId === where.lockId && !row.processedAt);
        for (const row of owned) Object.assign(row, data);
        return { count: owned.length };
      }) },
      $transaction: vi.fn(async (callback) => callback({
        $executeRaw: vi.fn(async (sql: TemplateStringsArray, id?: string, lockId?: string) => {
          if (!sql.join("").includes('UPDATE "OutboxEvent"')) return 0;
          const row = rows.find((entry) => entry.id === id && entry.lockId === lockId);
          if (!row) return 0;
          row.processedAt = new Date(); row.lockId = null; row.lockedAt = null;
          return 1;
        }),
      })),
    };
    return { rows, client: client as unknown as PrismaClient, updateMany: client.outboxEvent.updateMany };
  }

  it("renews queued rows while a slow publisher exceeds the original lease", async () => {
    vi.useFakeTimers();
    const { rows, client } = workers();
    let release!: () => void;
    const gate = new Promise<void>((done) => { release = done; });
    const published: string[] = [];
    const first = processOutboxBatch(async (event) => {
      published.push(event.aggregateId);
      if (event.aggregateId === "a") await gate;
    }, 2, client);
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(published).toEqual(["a"]);
    const second = await processOutboxBatch((event) => { published.push(event.aggregateId); }, 2, client);
    expect(second).toBe(0);
    release(); await first;
    expect(published).toEqual(["a", "b"]);
    expect(rows.every((row) => row.processedAt)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("skips a queued event reclaimed by another worker before dispatch", async () => {
    const { rows, client } = workers();
    const published: string[] = [];
    await processOutboxBatch((event) => {
      published.push(event.aggregateId);
      rows[1]!.lockId = "new-worker";
    }, 2, client);
    expect(published).toEqual(["a"]);
    expect(rows[1]).toMatchObject({ lockId: "new-worker", processedAt: null });
  });

  it("releases failed events for retry and stops renewing after the batch", async () => {
    vi.useFakeTimers();
    const { rows, client, updateMany } = workers();
    await processOutboxBatch(() => { throw new Error("Publisher unavailable"); }, 1, client);
    expect(rows[0]).toMatchObject({ attempts: 1, lockId: null, lockedAt: null, processedAt: null });
    const writes = updateMany.mock.calls.length;
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(updateMany).toHaveBeenCalledTimes(writes);
    expect(vi.getTimerCount()).toBe(0);
  });
});
