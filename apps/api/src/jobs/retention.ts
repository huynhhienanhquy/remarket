import type { PrismaClient } from "@prisma/client";
import { backgroundPrisma } from "../utils/background-prisma.js";

const BATCH = 500;
const AUTH_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const REPLAY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

/** Bounded cleanup. Never delete active credentials, pending work, or audit. */
export async function cleanupExpiredRecords(client: PrismaClient = backgroundPrisma, now = new Date()) {
  const authBefore = new Date(now.getTime() - AUTH_GRACE_MS);
  const replayBefore = new Date(now.getTime() - REPLAY_RETENTION_MS);
  const tokens = await client.$executeRaw`
    DELETE FROM "AuthToken" WHERE "id" IN (
      SELECT "id" FROM "AuthToken" WHERE "expiresAt" < ${authBefore}
      ORDER BY "expiresAt", "id" FOR UPDATE SKIP LOCKED LIMIT ${BATCH}
    )
  `;
  const sessions = await client.$executeRaw`
    DELETE FROM "Session" WHERE "id" IN (
      SELECT s."id" FROM "Session" s WHERE s."expiresAt" < ${authBefore}
        AND NOT EXISTS (SELECT 1 FROM "AuthToken" t WHERE t."sessionId" = s."id" AND t."expiresAt" >= ${authBefore})
      ORDER BY s."expiresAt", s."id" FOR UPDATE SKIP LOCKED LIMIT ${BATCH}
    )
  `;
  const events = await client.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; dedupeKey: string; createdAt: Date }>>`
      SELECT "id", "dedupeKey", "createdAt" FROM "OutboxEvent"
      WHERE "processedAt" < ${replayBefore} AND "lockedAt" IS NULL
      ORDER BY "processedAt", "id" FOR UPDATE SKIP LOCKED LIMIT ${BATCH}
    `;
    if (rows.length === 0) return 0;
    await tx.outboxDedupeKey.createMany({ data: rows.map(({ dedupeKey, createdAt }) => ({ dedupeKey, createdAt })), skipDuplicates: true });
    const removed = await tx.outboxEvent.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
    return removed.count;
  });
  return { tokens, sessions, events };
}
