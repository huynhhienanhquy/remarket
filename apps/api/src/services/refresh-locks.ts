import type { AuthToken, Prisma, Session } from "@prisma/client";
import type { SessionProfile } from "../shared/dto-mappers.js";

type LockedRow = SessionProfile & {
  lockedSessionId: string;
  sessionUserId: string;
  refreshHash: string | null;
  revokedAt: Date | null;
  sessionExpiresAt: Date;
  tokenId: string;
  tokenUserId: string;
  tokenSessionId: string | null;
  purpose: AuthToken["purpose"];
  consumedAt: Date | null;
  tokenExpiresAt: Date;
};

/** Preserve User -> Session -> AuthToken row locks, but acquire them in one statement. */
export async function lockRefreshState(tx: Prisma.TransactionClient, candidate: { id: string; userId: string; sessionId: string }) {
  const [row] = await tx.$queryRaw<LockedRow[]>`
    WITH locked_user AS MATERIALIZED (
      SELECT "id", "fullName", "email", "avatarUrl", "role", "status", "emailVerifiedAt",
             "phone", "provinceCode", "defaultAddress", "joinedAt"
      FROM "User" WHERE id = ${candidate.userId} FOR UPDATE
    ), locked_session AS MATERIALIZED (
      SELECT s.* FROM "Session" s CROSS JOIN locked_user u
      WHERE s.id = ${candidate.sessionId} FOR UPDATE OF s
    ), locked_token AS MATERIALIZED (
      SELECT a.* FROM "AuthToken" a CROSS JOIN locked_session s
      WHERE a.id = ${candidate.id} FOR UPDATE OF a
    )
    SELECT u.*, s.id AS "lockedSessionId", s."userId" AS "sessionUserId", s."refreshHash", s."revokedAt",
           s."expiresAt" AS "sessionExpiresAt", a.id AS "tokenId", a."userId" AS "tokenUserId",
           a."sessionId" AS "tokenSessionId", a.purpose, a."consumedAt", a."expiresAt" AS "tokenExpiresAt"
    FROM locked_user u CROSS JOIN locked_session s CROSS JOIN locked_token a`;
  if (!row) return null;
  const session: Pick<Session, "id" | "userId" | "refreshHash" | "revokedAt" | "expiresAt"> = {
    id: row.lockedSessionId, userId: row.sessionUserId, refreshHash: row.refreshHash,
    revokedAt: row.revokedAt, expiresAt: row.sessionExpiresAt,
  };
  const token: Pick<AuthToken, "id" | "userId" | "sessionId" | "purpose" | "consumedAt" | "expiresAt"> = {
    id: row.tokenId, userId: row.tokenUserId, sessionId: row.tokenSessionId,
    purpose: row.purpose, consumedAt: row.consumedAt, expiresAt: row.tokenExpiresAt,
  };
  return { user: row, session, token };
}
