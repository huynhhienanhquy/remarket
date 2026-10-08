-- Additive only: existing verified users and account states are unchanged.
ALTER TYPE "NotificationType" ADD VALUE 'EMAIL_VERIFICATION_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'EMAIL_VERIFIED';
ALTER TABLE "User" ADD COLUMN "emailVerificationRequestedAt" TIMESTAMP(3);
CREATE INDEX "User_emailVerifiedAt_emailVerificationRequestedAt_idx"
ON "User"("emailVerifiedAt", "emailVerificationRequestedAt");
