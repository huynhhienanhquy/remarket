CREATE TABLE "AiThread" (
    "id" TEXT PRIMARY KEY,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "scope" TEXT NOT NULL DEFAULT 'USER',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3)
);
CREATE INDEX "AiThread_userId_scope_updatedAt_idx" ON "AiThread"("userId", "scope", "updatedAt");
CREATE INDEX "AiThread_expiresAt_idx" ON "AiThread"("expiresAt");

CREATE TABLE "AiMessage" (
    "threadId" TEXT NOT NULL REFERENCES "AiThread"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "results" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("threadId", "id")
);
CREATE INDEX "AiMessage_threadId_createdAt_id_idx" ON "AiMessage"("threadId", "createdAt", "id");

CREATE TABLE "AiRun" (
    "threadId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "costMicros" INTEGER NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "latencyMs" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "errorCode" TEXT,
    PRIMARY KEY ("threadId", "id")
);
CREATE INDEX "AiRun_createdAt_idx" ON "AiRun"("createdAt");
CREATE INDEX "AiRun_userId_createdAt_idx" ON "AiRun"("userId", "createdAt");
CREATE INDEX "AiRun_ipHash_createdAt_idx" ON "AiRun"("ipHash", "createdAt");

CREATE TABLE "AiDailyBudget" (
    "day" DATE PRIMARY KEY,
    "costMicros" INTEGER NOT NULL
);
