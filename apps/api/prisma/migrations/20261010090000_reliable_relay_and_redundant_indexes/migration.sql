-- Preserve unique constraints; these ordinary indexes duplicate them.
DROP INDEX IF EXISTS "User_email_idx";
DROP INDEX IF EXISTS "Category_slug_idx";
DROP INDEX IF EXISTS "Order_code_idx";

CREATE SEQUENCE "OutboxRelaySequence";
ALTER TABLE "OutboxEvent" ADD COLUMN "relaySequence" BIGINT;
-- Historical rows form the bootstrap baseline for new API processes.
UPDATE "OutboxEvent" SET "relaySequence" = nextval('"OutboxRelaySequence"')
WHERE "processedAt" IS NOT NULL;
CREATE UNIQUE INDEX "OutboxEvent_relaySequence_key" ON "OutboxEvent"("relaySequence");
