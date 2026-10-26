import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

interface DatabaseOptions {
  url: string;
  connectionLimit: number;
  driver?: "native" | "pg";
  applicationName?: string;
  transactionOptions: { maxWait: number; timeout: number };
  log?: Prisma.PrismaClientOptions["log"];
}
const disposers = new WeakMap<PrismaClient, () => Promise<void>>();

export function pgPoolOptions(options: DatabaseOptions): pg.PoolConfig {
  const url = new URL(options.url);
  const schema = url.searchParams.get("schema") ?? "public";
  const max = Number(url.searchParams.get("connection_limit") ?? options.connectionLimit);
  const timeout = Number(url.searchParams.get("connect_timeout") ?? 10);
  if (!Number.isInteger(max) || max < 1 || max > 50) throw new Error("Invalid database pool limit");
  if (!Number.isFinite(timeout) || timeout < 0) throw new Error("Invalid database connection timeout");
  // Raw SQL uses this schema too. A non-public namespace requires a persistent
  // session: transaction poolers cannot retain a per-client search_path.
  if (schema !== "public" && url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    throw new Error("Non-public database schemas require the session/direct URL");
  }
  let ssl: pg.PoolConfig["ssl"];
  if ((url.hostname.endsWith(".pooler.supabase.com") || url.hostname.endsWith(".supabase.co")) && url.searchParams.get("sslmode") !== "disable"
    && !url.searchParams.has("sslrootcert") && !url.searchParams.has("sslcert")) {
    const caPath = new URL(import.meta.url.includes("/dist/apps/api/src/")
      ? "../../../../../certs/supabase-ca-2021.crt" : "../../certs/supabase-ca-2021.crt", import.meta.url);
    ssl = { ca: readFileSync(caPath, "utf8"), rejectUnauthorized: true };
    // pg's URL parser replaces the ssl object when sslmode is present.
    url.searchParams.delete("sslmode");
  }
  if (!ssl && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    && !url.searchParams.has("sslmode") && !url.searchParams.has("ssl")) ssl = { rejectUnauthorized: true };
  return {
    connectionString: url.toString(), max,
    // Keep the connections opened at HTTP startup. Otherwise a quiet minute
    // discards both and the next navigation pays TLS/authentication again.
    min: options.applicationName === "remarket-http" ? Math.min(2, max) : 0,
    connectionTimeoutMillis: timeout * 1000,
    idleTimeoutMillis: 60_000,
    allowExitOnIdle: true,
    keepAlive: true,
    application_name: options.applicationName ?? "remarket",
    ...(ssl ? { ssl } : {}),
    ...(schema === "public" ? {} : {
      onConnect: async (client: pg.ClientBase) => {
        await client.query("SELECT pg_catalog.set_config('search_path', $1, false)", [`"${schema.replaceAll('"', '""')}"`]);
        const { rows } = await client.query<{ schema: string | null }>("SELECT current_schema()::text AS schema");
        if (rows[0]?.schema !== schema) throw new Error("Database schema unavailable; refusing to query another schema");
      },
    }),
  };
}

/** Use the official adapter matching Prisma 5.22. Its pg queries are unnamed,
 * so transaction poolers do not need the native engine's compatibility wrapper. */
export function createDatabaseClient(options: DatabaseOptions): PrismaClient<Prisma.PrismaClientOptions, Prisma.LogLevel> {
  const url = new URL(options.url);
  if (!url.searchParams.has("connection_limit")) url.searchParams.set("connection_limit", String(options.connectionLimit));
  if (options.driver !== "pg") return new PrismaClient<Prisma.PrismaClientOptions, Prisma.LogLevel>({
    datasources: { db: { url: url.toString() } }, transactionOptions: options.transactionOptions,
    log: options.log ?? ["error", "warn"],
  });
  const pool = new pg.Pool(pgPoolOptions(options));
  pool.on("error", () => console.error(`${options.applicationName ?? "remarket"}: idle database connection failed`));
  const schema = new URL(options.url).searchParams.get("schema") ?? "public";
  const client = new PrismaClient<Prisma.PrismaClientOptions, Prisma.LogLevel>({ adapter: new PrismaPg(pool, { schema }),
    transactionOptions: options.transactionOptions, log: options.log ?? ["error", "warn"] });
  let closing: Promise<void> | undefined;
  disposers.set(client, () => closing ??= (async () => {
    try { await client.$disconnect(); } finally { await pool.end(); }
  })());
  return client;
}

/** Prisma 5 adapters do not own/dispose their caller-supplied pg.Pool. */
export function disconnectDatabaseClient(client: PrismaClient): Promise<void> {
  const globals = globalThis as { prisma?: PrismaClient; backgroundPrisma?: PrismaClient };
  if (globals.prisma === client) delete globals.prisma;
  if (globals.backgroundPrisma === client) delete globals.backgroundPrisma;
  return disposers.get(client)?.() ?? client.$disconnect();
}
