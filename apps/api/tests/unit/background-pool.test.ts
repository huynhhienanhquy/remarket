import { describe, expect, it, vi } from "vitest";

const constructed = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("@prisma/client", () => ({
  PrismaClient: class {
    constructor(options: Record<string, unknown>) { constructed.push(options); }
  },
}));
vi.mock("../../src/config/env.js", () => ({ env: {
  isProduction: true,
  databaseRuntimeUrl: "postgresql://test:test@localhost:5432/test?connection_limit=2&schema=verify",
  databaseConnectionLimit: 2,
  backgroundDatabaseUrl: "postgresql://test:test@localhost:5432/test?connection_limit=2&schema=verify",
  backgroundDatabaseConnectionLimit: 1,
  databaseTransactionMaxWaitMs: 10_000,
  databaseTransactionTimeoutMs: 30_000,
} }));

describe("background database pool", () => {
  it("creates a separate client with its own bounded pool, retaining the namespace", async () => {
    const previous = (globalThis as { prisma?: unknown }).prisma;
    delete (globalThis as { prisma?: unknown }).prisma;
    try {
      const { prisma } = await import("../../src/utils/prisma.js");
      const { backgroundPrisma } = await import("../../src/utils/background-prisma.js");
      expect(backgroundPrisma).not.toBe(prisma);
      expect(constructed).toHaveLength(2);
      const urls = constructed.map((options) => new URL((options.datasources as { db: { url: string } }).db.url));
      expect(urls.map((url) => url.searchParams.get("connection_limit"))).toEqual(["2", "1"]);
      expect(urls.map((url) => url.searchParams.get("schema"))).toEqual(["verify", "verify"]);
      expect(constructed[1]?.transactionOptions).toEqual({ maxWait: 10_000, timeout: 30_000 });
    } finally { (globalThis as { prisma?: unknown }).prisma = previous; }
  });
});
