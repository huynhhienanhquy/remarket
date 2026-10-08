import { Prisma } from "@prisma/client";
import type { Message } from "@prisma/client";
import { CHAT_LIMITS, validateChatMessage } from "@remarket/shared";
import type { AuthUser } from "../middleware/auth.js";
import { enqueueOutbox } from "../outbox/outbox.js";
import { accountLocked, emailNotVerified, notFound, productNotAvailable, validationError } from "../shared/errors.js";
import { toMessage } from "../shared/dto-mappers.js";
import { prisma } from "../utils/prisma.js";

const NOTIFICATION_PREVIEW_LENGTH = 120;

export interface ConversationParticipants {
  buyerId: string;
  sellerId: string;
}

export async function assertConversationParticipant(
  conversationId: string,
  viewerId: string,
): Promise<ConversationParticipants> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { buyerId: true, sellerId: true },
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
}): Promise<{ message: Message; created: boolean }> {
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
  const uniqueKey = {
    conversationId_senderId_clientMessageId: {
      conversationId,
      senderId: viewer.id,
      clientMessageId,
    },
  };
  const existing = await prisma.message.findUnique({ where: uniqueKey });
  if (existing) return { message: existing, created: false };

  try {
    const message = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${viewer.id} FOR SHARE`;
      const liveViewer = await tx.user.findUnique({
        where: { id: viewer.id },
        select: { status: true, emailVerifiedAt: true },
      });
      if (!liveViewer || liveViewer.status !== "ACTIVE") throw accountLocked();
      if (liveViewer.emailVerifiedAt === null) throw emailNotVerified();
      const thread = await tx.conversation.findUnique({ where: { id: conversationId }, select: { productId: true } });
      if (!thread) throw notFound("Không tìm thấy cuộc hội thoại này.");
      if (thread.productId) {
        await tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${thread.productId} FOR SHARE`;
        const product = await tx.product.findUnique({ where: { id: thread.productId }, select: { isBlocked: true, deletedAt: true } });
        if (!product || product.isBlocked || product.deletedAt !== null) throw productNotAvailable("Tin đăng không còn khả dụng nên không thể nhắn tin mới.");
      }
      const created = await tx.message.create({
        data: { conversationId, senderId: viewer.id, clientMessageId, content },
      });
      await tx.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      });
      const recipientId =
        conversation.buyerId === viewer.id ? conversation.sellerId : conversation.buyerId;
      await tx.notification.create({
        data: {
          userId: recipientId,
          type: "NEW_MESSAGE",
          title: `Tin nhắn mới từ ${viewer.fullName}`,
          content:
            content.length > NOTIFICATION_PREVIEW_LENGTH
              ? `${content.slice(0, NOTIFICATION_PREVIEW_LENGTH)}…`
              : content,
          referenceType: "conversation",
          referenceId: conversationId,
          dedupeKey: `msg:${created.id}`,
        },
      });
      await enqueueOutbox(tx, "message.created", conversationId, `message:${created.id}`, {
        conversation_id: conversationId,
        recipient_id: recipientId,
        message: { ...toMessage(created) },
      });
      return created;
    });
    return { message, created: true };
  } catch (error) {
    if (uniqueViolation(error)) {
      const duplicate = await prisma.message.findUnique({ where: uniqueKey });
      if (duplicate) return { message: duplicate, created: false };
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
    await enqueueOutbox(
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
  return { ...result, read_at: now.toISOString() };
}
