CREATE TYPE "UsageReservationStatus" AS ENUM (
    'PENDING',
    'COMPLETED',
    'RELEASED'
);

CREATE TABLE "UsageReservation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "reservedTokens" INTEGER NOT NULL,
    "reservedCostCents" INTEGER NOT NULL,
    "status" "UsageReservationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "UsageReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UsageReservation_requestId_key"
ON "UsageReservation"("requestId");

CREATE INDEX "UsageReservation_organizationId_status_expiresAt_idx"
ON "UsageReservation"("organizationId", "status", "expiresAt");

CREATE INDEX "UsageReservation_membershipId_status_expiresAt_idx"
ON "UsageReservation"("membershipId", "status", "expiresAt");

ALTER TABLE "UsageReservation"
ADD CONSTRAINT "UsageReservation_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UsageReservation"
ADD CONSTRAINT "UsageReservation_membershipId_fkey"
FOREIGN KEY ("membershipId") REFERENCES "Membership"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
