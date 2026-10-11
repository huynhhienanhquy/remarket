import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createNotifications } from "../../src/services/notifications.js";

describe("notification delivery atomicity", () => {
  it("emits only inserted notifications when a batch contains deduplicated rows", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { notification: { createManyAndReturn: vi.fn().mockResolvedValue([
      { id: "new", userId: "seller", referenceType: "order", referenceId: "order" },
    ]) }, outboxDedupeKey: { createManyAndReturn: vi.fn().mockImplementation(async ({ data }: { data: Array<{ dedupeKey: string }> }) => data) }, outboxEvent: { createMany } } as unknown as Prisma.TransactionClient;
    expect(await createNotifications(tx, { data: [], skipDuplicates: true })).toEqual({ count: 1 });
    expect(createMany).toHaveBeenCalledWith(expect.objectContaining({ data: [expect.objectContaining({
      eventType: "notification.created", aggregateId: "new", payload: expect.objectContaining({ recipients: ["seller"] }),
    })] }));
  });
  it("does not emit on replay and propagates delivery persistence failures for rollback", async () => {
    const createMany = vi.fn().mockRejectedValue(new Error("outbox failure"));
    const createManyAndReturn = vi.fn().mockResolvedValue([]);
    const tx = { notification: { createManyAndReturn }, outboxDedupeKey: { createManyAndReturn: vi.fn().mockImplementation(async ({ data }: { data: Array<{ dedupeKey: string }> }) => data) }, outboxEvent: { createMany } } as unknown as Prisma.TransactionClient;
    expect(await createNotifications(tx, { data: [] })).toEqual({ count: 0 });
    expect(createMany).not.toHaveBeenCalled();
    createManyAndReturn.mockResolvedValue([{ id: "new", userId: "seller" }]);
    await expect(createNotifications(tx, { data: [] })).rejects.toThrow("outbox failure");
  });
});
