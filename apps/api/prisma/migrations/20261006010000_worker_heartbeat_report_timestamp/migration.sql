-- Process-independent background-worker health. The API reads this row even
-- when jobs are deployed as a separate process/container.
CREATE TABLE "WorkerHeartbeat" (
  "id" TEXT NOT NULL,
  "running" BOOLEAN NOT NULL DEFAULT false,
  "lastRunAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  "lastError" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

-- Reports are mutable moderation records; preserve their last-change time as
-- required by the data specification.
ALTER TABLE "Report"
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
