CREATE TYPE "EmailOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'RETRY',
  'SENT',
  'FAILED'
);

CREATE TABLE "EmailOutbox" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "html" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" "EmailOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "providerId" TEXT,
  "lastError" TEXT,
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailOutbox_idempotencyKey_key"
  ON "EmailOutbox"("idempotencyKey");
CREATE INDEX "EmailOutbox_status_runAfter_idx"
  ON "EmailOutbox"("status", "runAfter");
CREATE INDEX "EmailOutbox_lockedAt_idx" ON "EmailOutbox"("lockedAt");
