import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createSession } from "../../src/services/session-issuance.js";
import { sha256, verifyAccessToken } from "../../src/shared/tokens.js";

describe("single-statement session issuance", () => {
  it("persists both records together, storing only the refresh hash", async () => {
    const execute = vi.fn().mockResolvedValue(1);
    const issued = await createSession({ $executeRaw: execute } as unknown as Prisma.TransactionClient, "user");
    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, ...parameters] = execute.mock.calls[0]!;
    expect((sql as TemplateStringsArray).join("?")).toContain('INSERT INTO "Session"');
    expect((sql as TemplateStringsArray).join("?")).toContain('INSERT INTO "AuthToken"');
    expect(parameters).toContain(sha256(issued.refreshToken));
    expect(parameters).not.toContain(issued.refreshToken);
    expect(verifyAccessToken(issued.accessToken)).toMatchObject({ userId: "user", sessionId: issued.sessionId });
  });
  it("does not issue credentials if persistence fails", async () => {
    const failure = new Error("Write failed");
    await expect(createSession({ $executeRaw: vi.fn().mockRejectedValue(failure) } as unknown as Prisma.TransactionClient, "user")).rejects.toBe(failure);
  });
  it("rejects an unexpected empty insert result", async () => {
    await expect(createSession({ $executeRaw: vi.fn().mockResolvedValue(0) } as unknown as Prisma.TransactionClient, "user")).rejects.toThrow("refresh token");
  });
});
