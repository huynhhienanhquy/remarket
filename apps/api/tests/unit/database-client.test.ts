import { describe, expect, it, vi } from "vitest";
import type pg from "pg";

const mocked = vi.hoisted(() => ({ disconnect: vi.fn(), end: vi.fn(), pools: [] as unknown[] }));
vi.mock("@prisma/client", () => ({ PrismaClient: class { $disconnect = mocked.disconnect; } }));
vi.mock("pg", () => ({ default: { Pool: class {
  constructor(options: unknown) { mocked.pools.push(options); }
  on = vi.fn(); end = mocked.end;
} } }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
import { createDatabaseClient, disconnectDatabaseClient, pgPoolOptions } from "../../src/utils/database-client.js";

const options = { url: "postgresql://test:test@localhost:5432/test", connectionLimit: 2,
  transactionOptions: { maxWait: 10_000, timeout: 30_000 } };

describe("owned PostgreSQL adapter pool", () => {
  it("keeps warmed HTTP connections within the configured budget while background pools may idle out", () => {
    expect(pgPoolOptions({ ...options, applicationName: "remarket-http" })).toMatchObject({ min: 2, max: 2 });
    expect(pgPoolOptions({ ...options, applicationName: "remarket-http", url: options.url + "?connection_limit=1" }))
      .toMatchObject({ min: 1, max: 1 });
    expect(pgPoolOptions({ ...options, applicationName: "remarket-background" }).min).toBe(0);
  });
  it("retains explicit pool budgets and namespaces", () => {
    const config = pgPoolOptions({ ...options, url: options.url + "?connection_limit=1&schema=verify&connect_timeout=15" });
    expect(config.max).toBe(1);
    expect(config.connectionTimeoutMillis).toBe(15_000);
    expect(config.onConnect).toBeTypeOf("function");
    expect(config.allowExitOnIdle).toBe(true);
  });

  it("awaits schema setup and refuses a missing namespace before application queries", async () => {
    const config = pgPoolOptions({ ...options, url: options.url + "?schema=verify" });
    const onConnect = config.onConnect as (client: pg.ClientBase) => Promise<void>;
    const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ schema: "verify" }] });
    await onConnect({ query } as unknown as pg.ClientBase);
    expect(query.mock.calls[0]![1]).toEqual(['"verify"']);
    query.mockReset().mockResolvedValue({ rows: [{ schema: "public" }] });
    await expect(onConnect({ query } as unknown as pg.ClientBase)).rejects.toThrow("refusing to query another schema");
  });

  it("refuses non-public raw-query namespaces on a shared transaction pool", () => {
    expect(() => pgPoolOptions({ ...options, url: "postgresql://test:test@aws-0-test.pooler.supabase.com:6543/test?schema=verify" }))
      .toThrow("require the session/direct URL");
  });

  it("uses the provider CA with certificate verification for Supabase", () => {
    const config = pgPoolOptions({ ...options, url: "postgresql://test:test@aws-0-test.pooler.supabase.com:6543/test?sslmode=require" });
    expect(config.ssl).toMatchObject({ rejectUnauthorized: true, ca: expect.stringContaining("BEGIN CERTIFICATE") });
    expect(new URL(config.connectionString!).searchParams.has("sslmode")).toBe(false);
  });

  it("disposes its own pool exactly once even for concurrent shutdown calls", async () => {
    mocked.disconnect.mockReset().mockResolvedValue(undefined);
    mocked.end.mockReset().mockResolvedValue(undefined);
    const client = createDatabaseClient({ ...options, driver: "pg" });
    await Promise.all([disconnectDatabaseClient(client), disconnectDatabaseClient(client)]);
    expect(mocked.disconnect).toHaveBeenCalledTimes(1);
    expect(mocked.end).toHaveBeenCalledTimes(1);
  });

  it("still closes the owned pool if disconnecting Prisma fails", async () => {
    mocked.disconnect.mockReset().mockRejectedValue(new Error("engine error"));
    mocked.end.mockReset().mockResolvedValue(undefined);
    const client = createDatabaseClient({ ...options, driver: "pg" });
    await expect(disconnectDatabaseClient(client)).rejects.toThrow("engine error");
    expect(mocked.end).toHaveBeenCalledTimes(1);
  });

  it("removes a closed client from the development cache without discarding another pool", async () => {
    mocked.disconnect.mockReset().mockResolvedValue(undefined);
    mocked.end.mockReset().mockResolvedValue(undefined);
    const client = createDatabaseClient({ ...options, driver: "pg" });
    const other = createDatabaseClient(options);
    const globals = globalThis as { prisma?: unknown; backgroundPrisma?: unknown };
    const previous = { prisma: globals.prisma, backgroundPrisma: globals.backgroundPrisma };
    globals.prisma = client; globals.backgroundPrisma = other;
    try {
      await disconnectDatabaseClient(client);
      expect(globals.prisma).toBeUndefined();
      expect(globals.backgroundPrisma).toBe(other);
    } finally { Object.assign(globals, previous); }
  });
});
