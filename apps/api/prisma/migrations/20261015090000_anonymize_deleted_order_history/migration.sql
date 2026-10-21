-- Remove retained name snapshots for accounts deleted before the deletion
-- workflow started scrubbing OrderStatusHistory.
UPDATE "OrderStatusHistory" AS history
SET "actorName" = 'Người dùng đã xóa'
FROM "User" AS actor
WHERE history."actorId" = actor."id"
  AND actor."deletedAt" IS NOT NULL;
