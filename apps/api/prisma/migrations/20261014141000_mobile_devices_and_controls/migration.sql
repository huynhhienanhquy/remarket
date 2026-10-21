ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE TABLE "UserBlock" (
  "blockerId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "blockedId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("blockerId", "blockedId"),
  CONSTRAINT "UserBlock_self_check" CHECK ("blockerId" <> "blockedId")
);
CREATE INDEX "UserBlock_blockedId_idx" ON "UserBlock"("blockedId");
CREATE TABLE "PushRegistration" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "sessionId" TEXT NOT NULL REFERENCES "Session"("id") ON DELETE CASCADE,
  "installationId" TEXT NOT NULL,
  "token" TEXT NOT NULL UNIQUE,
  "platform" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("userId", "installationId")
);
CREATE INDEX "PushRegistration_userId_enabled_idx" ON "PushRegistration"("userId", "enabled");
CREATE TABLE "PushDelivery" (
  "id" TEXT PRIMARY KEY,
  "notificationId" TEXT NOT NULL REFERENCES "Notification"("id") ON DELETE CASCADE,
  "registrationId" TEXT NOT NULL REFERENCES "PushRegistration"("id") ON DELETE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "ticketId" TEXT,
  "lastError" TEXT,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("notificationId", "registrationId")
);
CREATE INDEX "PushDelivery_status_nextAttemptAt_idx" ON "PushDelivery"("status", "nextAttemptAt");
