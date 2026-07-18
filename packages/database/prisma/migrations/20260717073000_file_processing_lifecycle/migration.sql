CREATE TYPE "FileProcessingStatus" AS ENUM (
  'PENDING_SCAN',
  'SCANNING',
  'EXTRACTING',
  'READY',
  'QUARANTINED',
  'FAILED'
);

CREATE TYPE "FileProcessingJobStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'RETRY',
  'COMPLETED',
  'FAILED'
);

ALTER TABLE "Organization"
  ADD COLUMN "storageBytesUsed" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "storedFileCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "StoredFile"
  ADD COLUMN "detectedMimeType" TEXT,
  ADD COLUMN "sha256" TEXT,
  ADD COLUMN "processingStatus" "FileProcessingStatus" NOT NULL DEFAULT 'PENDING_SCAN',
  ADD COLUMN "scanBypassed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "scanStartedAt" TIMESTAMP(3),
  ADD COLUMN "scannedAt" TIMESTAMP(3),
  ADD COLUMN "extractionStartedAt" TIMESTAMP(3),
  ADD COLUMN "extractedAt" TIMESTAMP(3),
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "failureMessage" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Legacy text was extracted before malware scanning. Remove it and enqueue every
-- existing object so upgrades never silently treat old content as trusted.
UPDATE "StoredFile"
SET "extractedText" = NULL,
    "processingStatus" = 'PENDING_SCAN',
    "failureCode" = NULL,
    "failureMessage" = NULL;

UPDATE "Organization" AS organization
SET "storageBytesUsed" = totals.bytes,
    "storedFileCount" = totals.files
FROM (
  SELECT "organizationId", COALESCE(SUM("sizeBytes"), 0)::BIGINT AS bytes,
         COUNT(*)::INTEGER AS files
  FROM "StoredFile"
  GROUP BY "organizationId"
) AS totals
WHERE organization.id = totals."organizationId";

CREATE TABLE "FileProcessingJob" (
  "id" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "status" "FileProcessingJobStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastErrorCode" TEXT,
  "lastErrorMessage" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FileProcessingJob_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FileProcessingJob_fileId_fkey"
    FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FileProcessingJob_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FileProcessingJob_fileId_key"
  ON "FileProcessingJob"("fileId");
CREATE INDEX "FileProcessingJob_status_runAfter_idx"
  ON "FileProcessingJob"("status", "runAfter");
CREATE INDEX "FileProcessingJob_organizationId_status_runAfter_idx"
  ON "FileProcessingJob"("organizationId", "status", "runAfter");
CREATE INDEX "FileProcessingJob_lockedAt_idx"
  ON "FileProcessingJob"("lockedAt");
CREATE INDEX "StoredFile_organizationId_processingStatus_idx"
  ON "StoredFile"("organizationId", "processingStatus");

INSERT INTO "FileProcessingJob" (
  "id", "fileId", "organizationId", "status", "runAfter", "createdAt", "updatedAt"
)
SELECT
  'legacy_' || md5(file.id || clock_timestamp()::TEXT || random()::TEXT),
  file.id,
  file."organizationId",
  'PENDING',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "StoredFile" AS file;

ALTER TABLE "FileProcessingJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FileProcessingJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY "file_processing_job_tenant_isolation" ON "FileProcessingJob"
FOR ALL
USING (
  "organizationId" = current_setting('app.organization_id', true)
)
WITH CHECK (
  "organizationId" = current_setting('app.organization_id', true)
);

-- Worker access remains opt-in per transaction. The application DB role is
-- already trusted to set the tenant context used by the existing RLS design.
CREATE POLICY "file_processing_job_worker" ON "FileProcessingJob"
FOR ALL
USING (current_setting('app.file_worker', true) = 'true')
WITH CHECK (current_setting('app.file_worker', true) = 'true');

CREATE POLICY "stored_file_worker" ON "StoredFile"
FOR ALL
USING (current_setting('app.file_worker', true) = 'true')
WITH CHECK (current_setting('app.file_worker', true) = 'true');
