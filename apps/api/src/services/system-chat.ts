import type { AuthUser } from "../middleware/auth.js";
import { accountLocked, emailNotVerified, forbidden, notFound } from "../shared/errors.js";
import { writeAudit } from "../shared/admin-helpers.js";
import { prisma } from "../utils/prisma.js";

/** One private official channel per admin/user pair; unique key makes retries safe. */
export async function openSystemConversation(admin: AuthUser, userId: string): Promise<string> {
  if (admin.role !== "ADMIN") throw forbidden();
  if (admin.status !== "ACTIVE") throw accountLocked();
  if (admin.emailVerifiedAt === null) throw emailNotVerified();
  if (userId === admin.id) throw forbidden("Không thể nhắn tin hệ thống cho chính bạn.");
  return prisma.$transaction(async (tx) => {
    const ids = [admin.id, userId].sort();
    const users = await tx.$queryRaw<Array<{ id: string; role: string; status: string; deletedAt: Date | null; emailVerifiedAt: Date | null }>>`
      SELECT "id", "role"::text, "status"::text, "deletedAt", "emailVerifiedAt" FROM "User"
      WHERE "id" IN (${ids[0]}, ${ids[1]}) ORDER BY "id" FOR SHARE`;
    const actor = users.find((user) => user.id === admin.id);
    const recipient = users.find((user) => user.id === userId);
    if (!actor || actor.deletedAt || actor.status !== "ACTIVE" || actor.role !== "ADMIN") throw forbidden();
    if (actor.emailVerifiedAt === null) throw emailNotVerified();
    if (!recipient || recipient.deletedAt) throw notFound("Không tìm thấy người dùng này.");
    if (recipient.role !== "USER") throw forbidden("Tin nhắn hệ thống chỉ gửi tới người dùng.");
    if (recipient.status !== "ACTIVE") throw forbidden("Người dùng đang bị khóa nên chưa thể nhận tin nhắn mới.");
    const conversation = await tx.conversation.upsert({
      where: { systemKey: `${admin.id}:${userId}` }, update: {},
      create: { systemKey: `${admin.id}:${userId}`, buyerId: userId, sellerId: admin.id },
      select: { id: true },
    });
    return conversation.id;
  });
}

export async function auditSystemMessage(tx: Parameters<typeof writeAudit>[0], actor: AuthUser, conversationId: string, messageId: string, recipientId: string): Promise<void> {
  await writeAudit(tx, { actorId: actor.id, actorName: actor.fullName, action: "user.system_message",
    entityType: "user", entityId: recipientId, metadata: { conversation_id: conversationId, message_id: messageId } });
}
