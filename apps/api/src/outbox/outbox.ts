import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../utils/prisma.js";

export interface RealtimeEvent {
  eventType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
}

export type OutboxPublisher = (event: RealtimeEvent) => Promise<void> | void;

export interface OutboxEntry {
  eventType: string;
  aggregateId: string;
  dedupeKey: string;
  payload: Prisma.InputJsonValue;
}

export async function enqueueOutboxBatch(tx: Prisma.TransactionClient, entries: readonly OutboxEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const claimed = await tx.outboxDedupeKey.createManyAndReturn({
    data: entries.map(({ dedupeKey }) => ({ dedupeKey })),
    skipDuplicates: true,
    select: { dedupeKey: true },
  });
  const keys = new Set(claimed.map((row) => row.dedupeKey));
  if (keys.size === 0) return;
  await tx.outboxEvent.createMany({ data: entries.filter((entry) => keys.has(entry.dedupeKey)), skipDuplicates: true });
}

export async function enqueueOutbox(
  tx: Prisma.TransactionClient,
  eventType: string,
  aggregateId: string,
  dedupeKey: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await enqueueOutboxBatch(tx, [{ eventType, aggregateId, dedupeKey, payload }]);
}

const MAX_ATTEMPTS = 10;
const LEASE_MS = 5 * 60 * 1000;

function retryDelayMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(attempts, 12));
}

/** Dispatch with renewable DB leases and ownership checks across workers. */
export async function processOutboxBatch(
  publish: OutboxPublisher,
  batchSize = 50,
  client: PrismaClient = prisma,
): Promise<number> {
  const lockId = randomUUID();
  const staleBefore = new Date(Date.now() - LEASE_MS);
  const rows = await client.$queryRaw<Array<{
    id: string;
    eventType: string;
    aggregateId: string;
    payload: Prisma.JsonValue;
    attempts: number;
  }>>`
    WITH candidates AS (
      SELECT "id"
      FROM "OutboxEvent"
      WHERE "processedAt" IS NULL
        AND "attempts" < ${MAX_ATTEMPTS}
        AND "nextAttemptAt" <= NOW()
        AND ("lockedAt" IS NULL OR "lockedAt" < ${staleBefore})
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE "OutboxEvent" event
    SET "lockedAt" = NOW(), "lockId" = ${lockId}
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING event."id", event."eventType", event."aggregateId", event."payload", event."attempts"
  `;
  if (rows.length === 0) return 0;

  // Renew ALL outstanding claims, including rows still waiting behind a slow
  // publisher. The original lease starts at batch claim time, not dispatch.
  let renewal: Promise<void> | null = null;
  let renewalError: unknown;
  const heartbeat = setInterval(() => {
    if (renewal) return;
    renewal = client.outboxEvent.updateMany({
      where: { lockId, processedAt: null },
      data: { lockedAt: new Date() },
    }).then(() => undefined).catch((error: unknown) => {
      renewalError = error;
    }).finally(() => { renewal = null; });
  }, LEASE_MS / 3);
  heartbeat.unref();

  try {
    for (const row of rows) {
      if (renewalError) throw renewalError;
      try {
        // A worker that resumes after losing its lease must not publish rows
        // reclaimed by another worker. Refresh and verify ownership atomically.
        const owned = await client.outboxEvent.updateMany({
          where: { id: row.id, lockId, processedAt: null },
          data: { lockedAt: new Date() },
        });
        if (owned.count !== 1) continue;
        await publish({
          eventType: row.eventType,
          aggregateId: row.aggregateId,
          payload: row.payload,
        });
        await client.$transaction(async (tx) => {
          // Sequence allocation is serialized THROUGH COMMIT. A bare sequence
          // does not order commits: another worker could commit a higher value
          // while this transaction is still invisible to the relay.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':outbox-relay-sequence', 0))`;
          await tx.$executeRaw`
            UPDATE "OutboxEvent"
            SET "processedAt" = NOW(), "relaySequence" = nextval('"OutboxRelaySequence"'),
                "lockedAt" = NULL, "lockId" = NULL, "lastError" = NULL
            WHERE "id" = ${row.id} AND "lockId" = ${lockId} AND "processedAt" IS NULL
          `;
        });
      } catch (error) {
        const attempts = row.attempts + 1;
        const message = error instanceof Error ? error.message : "Unknown outbox error";
        await client.outboxEvent.updateMany({
          where: { id: row.id, lockId },
          data: {
            attempts,
            nextAttemptAt: new Date(Date.now() + retryDelayMs(attempts)),
            lockedAt: null,
            lockId: null,
            lastError: message.slice(0, 2000),
          },
        });
        if (attempts >= MAX_ATTEMPTS) {
          console.error(`Outbox event ${row.id} (${row.eventType}) reached the retry limit.`);
        }
      }
    }
  } finally {
    clearInterval(heartbeat);
    await renewal;
  }

  return rows.length;
}
