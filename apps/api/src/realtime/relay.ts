import type { Prisma } from "@prisma/client";
import { backgroundPrisma as prisma } from "../utils/background-prisma.js";
import { publishRealtimeEvent } from "./events.js";

interface ProcessedEventRow {
  id: string;
  eventType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  processedAt: Date;
}

const BATCH_SIZE = 100;

/**
 * Relays durable events from PostgreSQL into this API process. Every API
 * instance runs its own relay, so each instance can notify the sockets it
 * owns even when background jobs run in a separate worker process.
 */
export function startRealtimeRelay(intervalMs = 1_000): () => void {
  let cursorAt = new Date();
  let cursorId = "";
  let running = false;
  let stopped = false;
  let retryAt = 0;
  let failures = 0;

  const poll = async (): Promise<void> => {
    if (running || stopped || Date.now() < retryAt) return;
    running = true;
    try {
      while (!stopped) {
        const rows = await prisma.$queryRaw<ProcessedEventRow[]>`
          SELECT "id", "eventType", "aggregateId", "payload", "processedAt"
          FROM "OutboxEvent"
          WHERE "processedAt" IS NOT NULL
            AND "eventType" NOT IN ('email.auth', 'storage.delete')
            AND (
              "processedAt" > ${cursorAt}
              OR ("processedAt" = ${cursorAt} AND "id" > ${cursorId})
            )
          ORDER BY "processedAt" ASC, "id" ASC
          LIMIT ${BATCH_SIZE}
        `;
        if (rows.length === 0) break;
        for (const row of rows) {
          publishRealtimeEvent({
            eventType: row.eventType,
            aggregateId: row.aggregateId,
            payload: row.payload,
          });
          cursorAt = row.processedAt;
          cursorId = row.id;
        }
        if (rows.length < BATCH_SIZE) break;
      }
      if (failures > 0) console.info("Realtime outbox relay recovered.");
      failures = 0;
      retryAt = 0;
    } catch (error) {
      failures += 1;
      retryAt = Date.now() + Math.min(30_000, 1_000 * 2 ** Math.min(failures - 1, 5));
      if (failures === 1) {
        console.error(
          "Realtime outbox relay failed; retrying with backoff:",
          error instanceof Error ? error.message : "Unknown relay error",
        );
      }
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void poll(), intervalMs);
  timer.unref();
  void poll();
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
