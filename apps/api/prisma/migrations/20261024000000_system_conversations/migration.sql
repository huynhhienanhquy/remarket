ALTER TABLE "Conversation" ADD COLUMN "systemKey" TEXT;
CREATE UNIQUE INDEX "Conversation_systemKey_key" ON "Conversation"("systemKey");
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_system_channel_check"
  CHECK ("systemKey" IS NULL OR ("productId" IS NULL AND "buyerId" <> "sellerId"
    AND "systemKey" = "sellerId" || ':' || "buyerId"));
