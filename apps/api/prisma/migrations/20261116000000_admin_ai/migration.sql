CREATE TABLE "AiSuggestion" (
    "id" TEXT PRIMARY KEY,
    "adminId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "clientRequestId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "output" JSONB,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "leaseId" TEXT,
    "leaseUntil" TIMESTAMP(3)
);

CREATE UNIQUE INDEX "AiSuggestion_adminId_clientRequestId_key" ON "AiSuggestion"("adminId", "clientRequestId");
CREATE INDEX "AiSuggestion_expiresAt_idx" ON "AiSuggestion"("expiresAt");
CREATE INDEX "AiSuggestion_leaseUntil_idx" ON "AiSuggestion"("leaseUntil");
