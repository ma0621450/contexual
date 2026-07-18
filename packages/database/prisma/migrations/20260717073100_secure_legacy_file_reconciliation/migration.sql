-- The previous StoredFile table is FORCE RLS. Migration roles without
-- BYPASSRLS may therefore see zero legacy rows until the worker policy exists.
-- Reconcile once that policy is present so every pre-lifecycle object is
-- guaranteed to be rescanned in production as well as development.
SELECT set_config('app.file_worker', 'true', false);

UPDATE "StoredFile" AS file
SET "extractedText" = NULL,
    "processingStatus" = 'PENDING_SCAN',
    "scanBypassed" = false,
    "scanStartedAt" = NULL,
    "scannedAt" = NULL,
    "extractionStartedAt" = NULL,
    "extractedAt" = NULL,
    "failureCode" = NULL,
    "failureMessage" = NULL,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1
  FROM "FileProcessingJob" AS job
  WHERE job."fileId" = file.id
);

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
FROM "StoredFile" AS file
WHERE NOT EXISTS (
  SELECT 1
  FROM "FileProcessingJob" AS job
  WHERE job."fileId" = file.id
);

UPDATE "Organization" AS organization
SET "storageBytesUsed" = COALESCE(totals.bytes, 0),
    "storedFileCount" = COALESCE(totals.files, 0)
FROM (
  SELECT org.id AS "organizationId",
         COALESCE(SUM(file."sizeBytes"), 0)::BIGINT AS bytes,
         COUNT(file.id)::INTEGER AS files
  FROM "Organization" AS org
  LEFT JOIN "StoredFile" AS file ON file."organizationId" = org.id
  GROUP BY org.id
) AS totals
WHERE organization.id = totals."organizationId";

SELECT set_config('app.file_worker', '', false);
