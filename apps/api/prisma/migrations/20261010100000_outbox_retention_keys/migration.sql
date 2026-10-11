CREATE TABLE "OutboxDedupeKey" (
  "dedupeKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxDedupeKey_pkey" PRIMARY KEY ("dedupeKey")
);
INSERT INTO "OutboxDedupeKey" ("dedupeKey", "createdAt")
SELECT "dedupeKey", "createdAt" FROM "OutboxEvent";
