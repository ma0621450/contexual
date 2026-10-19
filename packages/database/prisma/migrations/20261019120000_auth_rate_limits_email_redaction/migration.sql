-- Additive only: safe to apply while the previous release is still serving.

-- Shared fixed-window counters for authentication rate limits.
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitBucket_resetAt_idx" ON "RateLimitBucket"("resetAt");

-- Marks outbox rows whose bodies (OTPs, reset and invite links) were cleared.
ALTER TABLE "EmailOutbox" ADD COLUMN "contentRedactedAt" TIMESTAMP(3);
