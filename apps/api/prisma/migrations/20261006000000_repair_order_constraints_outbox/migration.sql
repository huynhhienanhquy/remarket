-- Repair the accidental Order.id -> Conversation.id relation from the baseline.
-- An order and a conversation are independent aggregates; conversations are
-- discovered by (product, buyer, seller), never by sharing a primary key.
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_id_fkey";

-- Reservation points at the order currently holding a product.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_reservedOrderId_fkey"
  FOREIGN KEY ("reservedOrderId") REFERENCES "Order"("id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_reviewedBy_fkey"
  FOREIGN KEY ("reviewedBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "cancelledById" TEXT;
ALTER TABLE "Order"
  ADD CONSTRAINT "Order_cancelledById_fkey"
  FOREIGN KEY ("cancelledById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrderStatusHistory" ADD COLUMN "actorId" TEXT;
ALTER TABLE "OrderStatusHistory"
  ADD CONSTRAINT "OrderStatusHistory_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "OrderStatusHistory_actorId_idx" ON "OrderStatusHistory"("actorId");

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_hiddenBy_fkey"
  FOREIGN KEY ("hiddenBy") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Uniqueness required by the API contract and idempotent transaction model.
CREATE UNIQUE INDEX "ProductImage_productId_sortOrder_key"
  ON "ProductImage"("productId", "sortOrder");
CREATE UNIQUE INDEX "Order_checkoutRequestId_sellerId_key"
  ON "Order"("checkoutRequestId", "sellerId");
CREATE UNIQUE INDEX "OrderItem_orderId_productId_key"
  ON "OrderItem"("orderId", "productId");

-- Database-level invariants. Services still validate these for useful errors,
-- while the database prevents corruption from races or maintenance scripts.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_price_check" CHECK ("price" > 0 AND "price" <= 1000000000),
  ADD CONSTRAINT "Product_shippingFee_check" CHECK ("shippingFee" >= 0 AND "shippingFee" <= 10000000),
  ADD CONSTRAINT "Product_usageMonths_check" CHECK ("usageMonths" IS NULL OR "usageMonths" >= 0),
  ADD CONSTRAINT "Product_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "Product_reservation_check" CHECK (("status" = 'RESERVED') = ("reservedOrderId" IS NOT NULL));

ALTER TABLE "ProductImage"
  ADD CONSTRAINT "ProductImage_sortOrder_check" CHECK ("sortOrder" BETWEEN 0 AND 7);

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_amounts_check" CHECK (
    "subtotal" >= 0 AND "shippingFee" >= 0 AND "totalAmount" = "subtotal" + "shippingFee"
  ),
  ADD CONSTRAINT "Order_participants_check" CHECK ("buyerId" <> "sellerId"),
  ADD CONSTRAINT "Order_version_check" CHECK ("version" > 0);

ALTER TABLE "OrderItem"
  ADD CONSTRAINT "OrderItem_price_check" CHECK ("price" > 0);

ALTER TABLE "Review"
  ADD CONSTRAINT "Review_rating_check" CHECK ("rating" BETWEEN 1 AND 5),
  ADD CONSTRAINT "Review_participants_check" CHECK ("reviewerId" <> "reviewedUserId");

ALTER TABLE "Report"
  ADD CONSTRAINT "Report_exactly_one_target_check" CHECK (
    (("targetProductId" IS NOT NULL)::int + ("targetUserId" IS NOT NULL)::int) = 1
  );

CREATE UNIQUE INDEX "Report_pending_product_key"
  ON "Report"("reporterId", "targetProductId")
  WHERE "status" = 'PENDING' AND "targetProductId" IS NOT NULL;
CREATE UNIQUE INDEX "Report_pending_user_key"
  ON "Report"("reporterId", "targetUserId")
  WHERE "status" = 'PENDING' AND "targetUserId" IS NOT NULL;

CREATE INDEX "Order_status_expiresAt_idx" ON "Order"("status", "expiresAt");
CREATE INDEX "Message_conversationId_createdAt_id_idx"
  ON "Message"("conversationId", "createdAt", "id");
CREATE INDEX "Notification_userId_readAt_createdAt_idx"
  ON "Notification"("userId", "readAt", "createdAt");

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "aggregateId" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "lockedAt" TIMESTAMP(3),
  "lockId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");
CREATE INDEX "OutboxEvent_processedAt_nextAttemptAt_idx"
  ON "OutboxEvent"("processedAt", "nextAttemptAt");
CREATE INDEX "OutboxEvent_lockedAt_idx" ON "OutboxEvent"("lockedAt");

-- Keep the complete refresh-token history so replaying any rotated token can
-- revoke its session, not only the immediately previous token.
ALTER TABLE "AuthToken" ADD COLUMN "sessionId" TEXT;
ALTER TABLE "AuthToken"
  ADD CONSTRAINT "AuthToken_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "AuthToken_sessionId_purpose_idx" ON "AuthToken"("sessionId", "purpose");
ALTER TABLE "AuthToken"
  ADD CONSTRAINT "AuthToken_purpose_session_check" CHECK (
    ("purpose" = 'REFRESH' AND "sessionId" IS NOT NULL)
    OR ("purpose" IN ('VERIFY_EMAIL', 'RESET_PASSWORD') AND "sessionId" IS NULL)
  );

-- Durable upload ownership/attachment metadata. Objects remain private; DTOs
-- expose a guarded API URL while mutations refer to storagePath.
ALTER TABLE "ProductImage" ADD COLUMN "storagePath" TEXT;
CREATE UNIQUE INDEX "ProductImage_storagePath_key" ON "ProductImage"("storagePath");

CREATE TABLE "UploadAsset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "productId" TEXT,
  "purpose" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "byteSize" INTEGER NOT NULL,
  "attachedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UploadAsset_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "UploadAsset"
  ADD CONSTRAINT "UploadAsset_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UploadAsset"
  ADD CONSTRAINT "UploadAsset_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "UploadAsset_storagePath_key" ON "UploadAsset"("storagePath");
CREATE INDEX "UploadAsset_userId_purpose_idx" ON "UploadAsset"("userId", "purpose");
CREATE INDEX "UploadAsset_productId_idx" ON "UploadAsset"("productId");
CREATE INDEX "UploadAsset_attachedAt_createdAt_idx" ON "UploadAsset"("attachedAt", "createdAt");

CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");
CREATE INDEX "Product_status_createdAt_id_idx" ON "Product"("status", "createdAt", "id");
CREATE INDEX "Product_categoryId_status_price_idx" ON "Product"("categoryId", "status", "price");
CREATE INDEX "Product_provinceCode_status_idx" ON "Product"("provinceCode", "status");
CREATE INDEX "Product_sellerId_status_idx" ON "Product"("sellerId", "status");
CREATE INDEX "Order_buyerId_createdAt_id_idx" ON "Order"("buyerId", "createdAt", "id");
CREATE INDEX "Order_sellerId_status_createdAt_idx" ON "Order"("sellerId", "status", "createdAt");
CREATE INDEX "Report_status_createdAt_idx" ON "Report"("status", "createdAt");
CREATE INDEX "SupportTicket_userId_status_idx" ON "SupportTicket"("userId", "status");
CREATE INDEX "SupportTicket_orderId_status_idx" ON "SupportTicket"("orderId", "status");
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx"
  ON "AuditLog"("entityType", "entityId", "createdAt");
