import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { newRefreshToken, sha256, signAccessToken } from "../shared/tokens.js";

export interface IssuedSession {
  sessionId: string;
  refreshToken: string;
  accessToken: string;
}

/**
 * The two dependent inserts are one PostgreSQL statement: either both commit
 * or neither does. Also accepts an existing transaction (email verification).
 * No raw token is persisted, and no JWT is issued before persistence succeeds.
 */
export async function createSession(tx: Prisma.TransactionClient, userId: string): Promise<IssuedSession> {
  const sessionId = randomUUID();
  const tokenId = randomUUID();
  const refreshToken = newRefreshToken();
  const refreshHash = sha256(refreshToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + env.refreshTtlDays * 24 * 60 * 60 * 1000);
  const inserted = await tx.$executeRaw`
    WITH issued AS (
      INSERT INTO "Session" ("id", "userId", "refreshHash", "expiresAt", "lastUsedAt")
      VALUES (${sessionId}, ${userId}, ${refreshHash}, ${expiresAt}, ${now})
      RETURNING "id"
    )
    INSERT INTO "AuthToken" ("id", "userId", "sessionId", "purpose", "tokenHash", "expiresAt")
    SELECT ${tokenId}, ${userId}, issued."id", 'REFRESH', ${refreshHash}, ${expiresAt} FROM issued
  `;
  if (inserted !== 1) throw new Error("Session issuance did not insert its refresh token");
  return { sessionId, refreshToken, accessToken: signAccessToken(userId, sessionId) };
}

/** Caller must hold User -> Session -> AuthToken locks and validate the token. */
export function rotateSessionRecords(tx: Prisma.TransactionClient, input: {
  tokenId: string; sessionId: string; presentedHash: string; nextHash: string;
  now: Date; expiresAt: Date;
}): Promise<number> {
  return tx.$executeRaw`
    WITH consumed AS (
      UPDATE "AuthToken" SET "consumedAt" = ${input.now}
      WHERE "id" = ${input.tokenId} AND "consumedAt" IS NULL
      RETURNING "userId", "sessionId"
    ), replacement AS (
      INSERT INTO "AuthToken" ("id", "userId", "sessionId", "purpose", "tokenHash", "expiresAt")
      SELECT ${randomUUID()}, "userId", "sessionId", 'REFRESH', ${input.nextHash}, ${input.expiresAt} FROM consumed
      RETURNING "sessionId"
    )
    UPDATE "Session" SET "refreshPrevHash" = ${input.presentedHash}, "refreshHash" = ${input.nextHash},
      "lastUsedAt" = ${input.now}, "expiresAt" = ${input.expiresAt}
    WHERE "id" = ${input.sessionId} AND "id" IN (SELECT "sessionId" FROM replacement)
  `;
}
