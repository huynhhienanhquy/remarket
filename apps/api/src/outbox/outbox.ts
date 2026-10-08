import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../utils/prisma.js";

export interface RealtimeEvent {
  eventType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
}

export type OutboxPublisher = (event: RealtimeEvent) => Promise<void> | void;

export async function enqueueOutbox(
  tx: Prisma.TransactionClient,
  eventType: string,
  aggregateId: string,
  dedupeKey: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  // A no-op upsert may perform read/insert/read. Nothing needs returning here:
  // one INSERT ... ON CONFLICT DO NOTHING preserves the unique dedupe key and
  // never overwrites the original payload or delivery state on replay.
  await tx.outboxEvent.createMany({
    data: [{ eventType, aggregateId, dedupeKey, payload }],
    skipDuplicates: true,
  });
}

const MAX_ATTEMPTS = 10;
const LEASE_MS = 5 * 60 * 1000;

function retryDelayMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 1000 * 2 ** Math.min(attempts, 12));
}

/** Claims rows with a DB lease so multiple worker processes cannot double-send. */
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

  for (const row of rows) {
    try {
      await publish({
        eventType: row.eventType,
        aggregateId: row.aggregateId,
        payload: row.payload,
      });
      await client.outboxEvent.updateMany({
        where: { id: row.id, lockId },
        data: { processedAt: new Date(), lockedAt: null, lockId: null, lastError: null },
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

  return rows.length;
}
