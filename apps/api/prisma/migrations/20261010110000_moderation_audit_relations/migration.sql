ALTER TABLE "AuditLog"
  ADD COLUMN "targetUserId" TEXT,
  ADD COLUMN "targetProductId" TEXT,
  ADD COLUMN "targetCategoryId" TEXT,
  ADD COLUMN "targetReviewId" TEXT;

UPDATE "AuditLog" a SET "targetUserId" = a."entityId"
WHERE a."entityType" = 'user' AND EXISTS (SELECT 1 FROM "User" e WHERE e."id" = a."entityId");
UPDATE "AuditLog" a SET "targetProductId" = a."entityId"
WHERE a."entityType" = 'product' AND EXISTS (SELECT 1 FROM "Product" e WHERE e."id" = a."entityId");
UPDATE "AuditLog" a SET "targetCategoryId" = a."entityId"
WHERE a."entityType" = 'category' AND EXISTS (SELECT 1 FROM "Category" e WHERE e."id" = a."entityId");
UPDATE "AuditLog" a SET "targetReviewId" = a."entityId"
WHERE a."entityType" = 'review' AND EXISTS (SELECT 1 FROM "Review" e WHERE e."id" = a."entityId");

ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetCategoryId_fkey" FOREIGN KEY ("targetCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_targetReviewId_fkey" FOREIGN KEY ("targetReviewId") REFERENCES "Review"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AuditLog_targetUserId_actorId_createdAt_idx" ON "AuditLog"("targetUserId", "actorId", "createdAt");
CREATE INDEX "AuditLog_targetProductId_actorId_createdAt_idx" ON "AuditLog"("targetProductId", "actorId", "createdAt");
CREATE INDEX "AuditLog_targetCategoryId_actorId_createdAt_idx" ON "AuditLog"("targetCategoryId", "actorId", "createdAt");
CREATE INDEX "AuditLog_targetReviewId_actorId_createdAt_idx" ON "AuditLog"("targetReviewId", "actorId", "createdAt");
