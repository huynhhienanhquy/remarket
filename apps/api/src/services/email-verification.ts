import { Prisma, type User } from "@prisma/client";
import type { EmailVerificationRequest } from "@remarket/shared";
import { accountLocked, forbidden, notFound } from "../shared/errors.js";
import { writeAudit, type AdminActor } from "../shared/admin-helpers.js";
import { enqueueOutbox } from "../outbox/outbox.js";

export function toEmailVerificationRequest(user: User): EmailVerificationRequest | null {
  if (!user.emailVerificationRequestedAt) return null;
  return {
    id: user.id,
    user: { id: user.id, full_name: user.fullName, email: user.email, status: user.status },
    status: user.emailVerifiedAt ? "APPROVED" : "PENDING",
    requested_at: user.emailVerificationRequestedAt.toISOString(),
    approved_at: user.emailVerifiedAt?.toISOString() ?? null,
  };
}

/** One request per immutable account email; the user lock serializes retries. */
export async function requestEmailVerification(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw notFound();
  if (user.status !== "ACTIVE") throw accountLocked();
  if (user.emailVerifiedAt || user.emailVerificationRequestedAt) return toEmailVerificationRequest(user);
  const updated = await tx.user.update({
    where: { id: userId }, data: { emailVerificationRequestedAt: new Date() },
  });
  const admins = await tx.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (admins.length) await tx.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id, type: "EMAIL_VERIFICATION_REQUESTED",
      title: "Yêu cầu xác minh email", content: `${user.fullName} đã gửi yêu cầu xác minh email.`,
      referenceType: "email_verification", referenceId: userId,
      dedupeKey: `email-verification:${userId}:requested`,
    })), skipDuplicates: true,
  });
  await writeAudit(tx, {
    actorId: userId, actorName: user.fullName, actorType: "USER",
    action: "user.email_verification_requested", entityType: "user", entityId: userId,
  });
  await enqueueOutbox(tx, "notification.created", userId, `email-verification:${userId}:requested`, {
    recipients: admins.map((admin) => admin.id), reference_type: "email_verification", reference_id: userId,
  });
  return toEmailVerificationRequest(updated);
}

/** Approval, notification and audit either commit together or roll back together. */
export async function approveEmailVerification(tx: Prisma.TransactionClient, userId: string, actor: AdminActor) {
  const ids = [...new Set([userId, actor.id])].sort();
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${Prisma.join(ids)}) ORDER BY "id" FOR UPDATE`;
  const admin = await tx.user.findUnique({ where: { id: actor.id } });
  if (!admin || admin.role !== "ADMIN") throw forbidden();
  if (admin.status !== "ACTIVE") throw accountLocked();
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user?.emailVerificationRequestedAt) throw notFound("Không tìm thấy yêu cầu xác minh email.");
  if (user.emailVerifiedAt) return toEmailVerificationRequest(user)!;
  const now = new Date();
  const updated = await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: now } });
  await tx.authToken.updateMany({ where: { userId, purpose: "VERIFY_EMAIL", consumedAt: null }, data: { consumedAt: now } });
  await tx.notification.createMany({ data: [{
    userId, type: "EMAIL_VERIFIED", title: "Email đã được xác minh",
    content: "Admin đã đồng ý xác minh email của bạn.", referenceType: "account", referenceId: userId,
    dedupeKey: `email-verification:${userId}:approved`,
  }], skipDuplicates: true });
  await writeAudit(tx, {
    actorId: admin.id, actorName: admin.fullName, action: "user.email_verified",
    entityType: "user", entityId: userId, metadata: { email_verified_at: now.toISOString() },
  });
  const admins = await tx.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
  await enqueueOutbox(tx, "email.verified", userId, `email-verification:${userId}:approved`, {
    recipients: [userId],
  });
  await enqueueOutbox(tx, "notification.created", userId, `email-verification:${userId}:approved-admins`, {
    recipients: admins.map((item) => item.id), reference_type: "email_verification", reference_id: userId,
  });
  return toEmailVerificationRequest(updated)!;
}
