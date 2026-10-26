import { Prisma } from "@prisma/client";
import type { Message } from "@prisma/client";
import { CHAT_LIMITS, validateChatMessage } from "@remarket/shared";
import type { AuthUser } from "../middleware/auth.js";
import { enqueueOutbox, enqueueOutboxBatch } from "../outbox/outbox.js";
import { accountLocked, emailNotVerified, notFound, productNotAvailable, validationError, forbidden } from "../shared/errors.js";
import { toMessage } from "../shared/dto-mappers.js";
import { prisma } from "../utils/prisma.js";
import { publishRealtimeEvent } from "../realtime/events.js";
import { auditSystemMessage } from "./system-chat.js";

const NOTIFICATION_PREVIEW_LENGTH = 120;

export interface ConversationParticipants {
  buyerId: string;
  sellerId: string;
  productId: string | null;
  systemKey?: string | null;
}

export async function assertConversationParticipant(
  conversationId: string,
  viewerId: string,
): Promise<ConversationParticipants> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { buyerId: true, sellerId: true, productId: true, systemKey: true },
  });
  if (
    !conversation ||
    (conversation.buyerId !== viewerId && conversation.sellerId !== viewerId)
  ) {
    throw notFound("Không tìm thấy cuộc hội thoại này.");
  }
  return conversation;
}

function uniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function sendChatMessage(input: {
  conversationId: string;
  viewer: AuthUser;
  clientMessageId: string;
  content: string;
}): Promise<{ message: Message; created: boolean; isSystem?: boolean }> {
  const { conversationId, viewer, clientMessageId } = input;
  if (viewer.status !== "ACTIVE") {
    throw accountLocked("Tài khoản đang bị hạn chế nên không thể gửi tin nhắn.");
  }
  if (viewer.emailVerifiedAt === null) {
    throw emailNotVerified("Vui lòng xác minh email để nhắn tin.");
  }
  const content = input.content.trim();
  const messageError = validateChatMessage(content);
  if (messageError) throw validationError(messageError, { content: messageError });
  if (content.length < CHAT_LIMITS.messageMin) {
    throw validationError("Tin nhắn không được để trống.", { content: "Bắt buộc." });
  }

  const conversation = await assertConversationParticipant(conversationId, viewer.id);
  const official = Boolean(conversation.systemKey);
  const isSystem = official && viewer.id === conversation.sellerId;
  if (isSystem && viewer.role !== "ADMIN") throw forbidden();
  const uniqueKey = {
    conversationId_senderId_clientMessageId: {
      conversationId,
      senderId: viewer.id,
      clientMessageId,
    },
  };
  const existing = await prisma.message.findUnique({ where: uniqueKey });
  if (existing) return { message: existing, created: false, ...(isSystem ? { isSystem: true } : {}) };

  try {
    const message = await prisma.$transaction(async (tx) => {
      const participantIds = [conversation.buyerId, conversation.sellerId].sort();
      const participants = await tx.$queryRaw<Array<{ id: string; role: string; status: string; emailVerifiedAt: Date | null; deletedAt: Date | null }>>`
        SELECT "id", "role"::text, "status"::text, "emailVerifiedAt", "deletedAt" FROM "User"
        WHERE "id" IN (${participantIds[0]}, ${participantIds[1]}) ORDER BY "id" FOR SHARE`;
      const blocked = await tx.userBlock.findFirst({ where: { OR: [
        { blockerId: conversation.buyerId, blockedId: conversation.sellerId },
        { blockerId: conversation.sellerId, blockedId: conversation.buyerId },
      ] }, select: { blockerId: true } });
      if (blocked) throw forbidden("Không thể nhắn tin giữa hai tài khoản đã chặn nhau.");
      const liveViewer = participants.find((participant) => participant.id === viewer.id);
      if (!liveViewer || liveViewer.deletedAt || liveViewer.status !== "ACTIVE") throw accountLocked();
      if (liveViewer.emailVerifiedAt === null) throw emailNotVerified();
      const recipientId = conversation.buyerId === viewer.id ? conversation.sellerId : conversation.buyerId;
      const recipient = participants.find((participant) => participant.id === recipientId);
      if (!recipient || recipient.deletedAt || recipient.status !== "ACTIVE") throw forbidden("Người nhận hiện không thể nhận tin nhắn mới.");
      if (official && participants.find((participant) => participant.id === conversation.sellerId)?.role !== "ADMIN") throw forbidden("Kênh hệ thống hiện không thể gửi tin nhắn.");
      if (conversation.productId) {
        const [product] = await tx.$queryRaw<Array<{ isBlocked: boolean; deletedAt: Date | null }>>`
          SELECT "isBlocked", "deletedAt" FROM "Product" WHERE "id" = ${conversation.productId} FOR SHARE`;
        if (!product || product.isBlocked || product.deletedAt !== null) throw productNotAvailable("Tin đăng không còn khả dụng nên không thể nhắn tin mới.");
      }
      const created = await tx.message.create({
        data: { conversationId, senderId: viewer.id, clientMessageId, content },
      });
      if (isSystem) await auditSystemMessage(tx, viewer, conversationId, created.id, recipientId);
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      const notification = await tx.notification.create({
        data: {
          userId: recipientId,
          type: "NEW_MESSAGE",
          title: isSystem ? "Tin nhắn từ Hệ thống ReMarket" : `Tin nhắn mới từ ${viewer.fullName}`,
          content:
            content.length > NOTIFICATION_PREVIEW_LENGTH
              ? `${content.slice(0, NOTIFICATION_PREVIEW_LENGTH)}…`
              : content,
          referenceType: "conversation",
          referenceId: conversationId,
          dedupeKey: `msg:${created.id}`,
        },
      });
      await enqueueOutboxBatch(tx, [{ eventType: "notification.created", aggregateId: notification.id,
        dedupeKey: `notification:${notification.id}`, payload: { notification_id: notification.id,
          recipients: [recipientId], reference_type: "conversation", reference_id: conversationId } },
      { eventType: "message.created", aggregateId: conversationId, dedupeKey: `message:${created.id}`, payload: {
        conversation_id: conversationId,
        recipient_id: recipientId,
        message: { ...toMessage(created, isSystem) },
      } }]);
      return { created, notification };
    });
    // Local sockets receive committed data immediately. The durable relay still
    // delivers to other API instances and recovers a crash after this commit.
    try {
      publishRealtimeEvent({ eventType: "message.created", aggregateId: conversationId, payload: {
        conversation_id: conversationId,
        recipient_id: message.notification.userId,
        message: { ...toMessage(message.created, isSystem) },
      } });
      publishRealtimeEvent({ eventType: "notification.created", aggregateId: message.notification.id, payload: {
        notification_id: message.notification.id, recipients: [message.notification.userId],
        reference_type: "conversation", reference_id: conversationId,
      } });
    } catch (error) {
      console.error("Immediate chat delivery failed; durable relay will retry:", error instanceof Error ? error.message : error);
    }
    return { message: message.created, created: true, ...(isSystem ? { isSystem: true } : {}) };
  } catch (error) {
    if (uniqueViolation(error)) {
      const duplicate = await prisma.message.findUnique({ where: uniqueKey });
      if (duplicate) return { message: duplicate, created: false, ...(isSystem ? { isSystem: true } : {}) };
    }
    throw error;
  }
}

export async function markConversationRead(input: {
  conversationId: string;
  viewerId: string;
  lastMessageId: string;
}): Promise<{ unread: number; updated: number; read_at: string }> {
  await assertConversationParticipant(input.conversationId, input.viewerId);
  const target = await prisma.message.findFirst({
    where: { id: input.lastMessageId, conversationId: input.conversationId },
    select: { createdAt: true },
  });
  if (!target) throw notFound("Không tìm thấy tin nhắn này.");

  const now = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.message.updateMany({
      where: {
        conversationId: input.conversationId,
        senderId: { not: input.viewerId },
        readAt: null,
        OR: [
          { createdAt: { lt: target.createdAt } },
          { createdAt: target.createdAt, id: { lte: input.lastMessageId } },
        ],
      },
      data: { readAt: now },
    });
    const unread = await tx.message.count({ where: {
      conversationId: input.conversationId, senderId: { not: input.viewerId }, readAt: null,
    } });
    if (updated.count > 0) await enqueueOutbox(
      tx,
      "conversation.read",
      input.conversationId,
      `conversation:${input.conversationId}:read:${input.viewerId}:${input.lastMessageId}`,
      {
        conversation_id: input.conversationId,
        reader_id: input.viewerId,
        last_message_id: input.lastMessageId,
        read_at: now.toISOString(),
        unread,
        updated: updated.count,
      },
    );
    return { updated: updated.count, unread };
  });
  if (result.updated > 0) {
    try {
      publishRealtimeEvent({ eventType: "conversation.read", aggregateId: input.conversationId, payload: {
        conversation_id: input.conversationId, reader_id: input.viewerId, last_message_id: input.lastMessageId,
        read_at: now.toISOString(), ...result,
      } });
    } catch (error) {
      console.error("Immediate read receipt delivery failed; durable relay will retry:", error instanceof Error ? error.message : error);
    }
  }
  return { ...result, read_at: now.toISOString() };
}
