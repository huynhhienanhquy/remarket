import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { enqueueOutbox } from "../../src/outbox/outbox.js";

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
