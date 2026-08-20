CREATE TYPE "PlatformRole" AS ENUM ('SUPPORT', 'OPERATOR', 'OWNER');

CREATE TABLE "PlatformAdmin" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "PlatformRole" NOT NULL DEFAULT 'SUPPORT',
  "totpSecretCiphertext" TEXT,
  "totpSecretIv" TEXT,
  "totpConfirmedAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAdmin_userId_key" ON "PlatformAdmin"("userId");

ALTER TABLE "PlatformAdmin"
  ADD CONSTRAINT "PlatformAdmin_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PlatformAuditLog" (
  "id" TEXT NOT NULL,
  "platformAdminId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT,
  "targetId" TEXT,
  "details" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformAuditLog_createdAt_idx" ON "PlatformAuditLog"("createdAt");
CREATE INDEX "PlatformAuditLog_platformAdminId_createdAt_idx" ON "PlatformAuditLog"("platformAdminId", "createdAt");
CREATE INDEX "PlatformAuditLog_targetType_targetId_createdAt_idx" ON "PlatformAuditLog"("targetType", "targetId", "createdAt");

ALTER TABLE "PlatformAuditLog"
  ADD CONSTRAINT "PlatformAuditLog_platformAdminId_fkey"
  FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ImpersonationGrant" (
  "id" TEXT NOT NULL,
  "platformAdminId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "targetOrganizationId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "redeemTokenHash" TEXT NOT NULL,
  "redeemedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ImpersonationGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImpersonationGrant_redeemTokenHash_key" ON "ImpersonationGrant"("redeemTokenHash");
CREATE INDEX "ImpersonationGrant_platformAdminId_createdAt_idx" ON "ImpersonationGrant"("platformAdminId", "createdAt");
CREATE INDEX "ImpersonationGrant_targetUserId_createdAt_idx" ON "ImpersonationGrant"("targetUserId", "createdAt");
CREATE INDEX "ImpersonationGrant_targetOrganizationId_createdAt_idx" ON "ImpersonationGrant"("targetOrganizationId", "createdAt");

ALTER TABLE "ImpersonationGrant"
  ADD CONSTRAINT "ImpersonationGrant_platformAdminId_fkey"
  FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdmin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImpersonationGrant"
  ADD CONSTRAINT "ImpersonationGrant_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImpersonationGrant"
  ADD CONSTRAINT "ImpersonationGrant_targetOrganizationId_fkey"
  FOREIGN KEY ("targetOrganizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Platform staff read access to RLS-protected tenant tables. SELECT only, so a
-- platform session can never mutate tenant rows even if application code is
-- wrong. Opt-in per transaction, matching the existing app.file_worker design.
CREATE POLICY "memory_platform_read" ON "Memory"
FOR SELECT
USING (current_setting('app.platform_admin', true) = 'true');

CREATE POLICY "stored_file_platform_read" ON "StoredFile"
FOR SELECT
USING (current_setting('app.platform_admin', true) = 'true');

CREATE POLICY "message_attachment_platform_read" ON "MessageAttachment"
FOR SELECT
USING (current_setting('app.platform_admin', true) = 'true');

CREATE POLICY "file_processing_job_platform_read" ON "FileProcessingJob"
FOR SELECT
USING (current_setting('app.platform_admin', true) = 'true');
