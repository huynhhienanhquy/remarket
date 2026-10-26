-- Match inbox ordering and unread lookups without scanning historical messages.
CREATE INDEX "Conversation_buyerId_updatedAt_id_idx" ON "Conversation" ("buyerId", "updatedAt" DESC, "id" DESC);
CREATE INDEX "Conversation_sellerId_updatedAt_id_idx" ON "Conversation" ("sellerId", "updatedAt" DESC, "id" DESC);
CREATE INDEX "Message_unread_conversation_idx" ON "Message" ("conversationId", "senderId", "createdAt", "id") WHERE "readAt" IS NULL;
CREATE INDEX "Notification_userId_createdAt_id_idx" ON "Notification" ("userId", "createdAt" DESC, "id" DESC);
CREATE INDEX "OutboxEvent_pending_realtime_idx" ON "OutboxEvent" ("createdAt", "id")
WHERE "processedAt" IS NULL AND "attempts" < 10 AND "eventType" NOT IN ('email.auth', 'storage.delete');
