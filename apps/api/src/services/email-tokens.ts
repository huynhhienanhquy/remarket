import { Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { enqueueOutbox } from "../outbox/outbox.js";
import { sealEmailToken } from "../services/email.js";
import { newEmailToken, sha256 } from "../shared/tokens.js";
import { prisma } from "../utils/prisma.js";

/** One active token per purpose: resending invalidates the previous one. */
export async function createEmailToken(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    recipient: string;
    purpose: "VERIFY_EMAIL" | "RESET_PASSWORD";
    ttlMs: number;
    token: string;
    mobile?: boolean;
  },
): Promise<void> {
  if (!env.emailEnabled) return;
  await tx.authToken.updateMany({
    where: { userId: input.userId, purpose: input.purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  const created = await tx.authToken.create({
    data: {
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: sha256(input.token),
      expiresAt: new Date(Date.now() + input.ttlMs),
    },
  });
  if (env.isProduction) {
    await enqueueOutbox(tx, "email.auth", input.userId, `email-auth:${created.id}`, {
      to: input.recipient,
      purpose: input.purpose,
      token_id: created.id,
      sealed_token: sealEmailToken(input.token),
      ...(input.mobile ? { mobile: true } : {}),
    });
  }
}

export async function issueEmailToken(
  userId: string,
  recipient: string,
  purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
  ttlMs: number,
  label: string,
  mobile = false,
): Promise<void> {
  const token = newEmailToken();
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    await createEmailToken(tx, { userId, recipient, purpose, ttlMs, token, mobile });
  });

  // Non-production environments also surface the token for manual testing.
  if (!env.isProduction) {
    console.log(`[dev] ${label}: ${token}`);
  }
}

/** Consumes a one-time token exactly once; returns the owner or null. */
export async function consumeEmailToken(
  tx: Prisma.TransactionClient,
  raw: string,
  purpose: "VERIFY_EMAIL" | "RESET_PASSWORD",
): Promise<string | null> {
  const tokenHash = sha256(raw.trim());
  const candidate = await tx.authToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true },
  });
  if (!candidate) return null;
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${candidate.userId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "AuthToken" WHERE "id" = ${candidate.id} FOR UPDATE`;
  const record = await tx.authToken.findUnique({ where: { id: candidate.id } });
  if (!record || record.purpose !== purpose) return null;
  if (record.consumedAt !== null) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;

  // Conditional update: only one concurrent caller wins the token.
  const consumed = await tx.authToken.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return consumed.count === 1 ? record.userId : null;
}
