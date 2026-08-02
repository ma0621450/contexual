-- Multi-provider connections: one encrypted API key per provider per organization.
CREATE TABLE "OrganizationProvider" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" "AiProvider" NOT NULL,
  "apiKeyCiphertext" TEXT NOT NULL,
  "apiKeyIv" TEXT NOT NULL,
  "defaultModel" TEXT NOT NULL,
  "connectedById" TEXT,
  "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrganizationProvider_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrganizationProvider_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrganizationProvider_connectedById_fkey"
    FOREIGN KEY ("connectedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrganizationProvider_organizationId_provider_key"
  ON "OrganizationProvider"("organizationId", "provider");
CREATE INDEX "OrganizationProvider_organizationId_idx"
  ON "OrganizationProvider"("organizationId");
CREATE INDEX "OrganizationProvider_connectedById_idx"
  ON "OrganizationProvider"("connectedById");

-- Preserve any previously connected single-provider keys.
INSERT INTO "OrganizationProvider" (
  "id",
  "organizationId",
  "provider",
  "apiKeyCiphertext",
  "apiKeyIv",
  "defaultModel",
  "connectedById",
  "connectedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy_' || md5(organization.id || COALESCE(organization."apiKeyProvider"::TEXT, '') || clock_timestamp()::TEXT),
  organization.id,
  organization."apiKeyProvider",
  organization."apiKeyCiphertext",
  organization."apiKeyIv",
  COALESCE(organization."defaultModel", 'gpt-4o-mini'),
  organization."apiKeyAddedById",
  COALESCE(organization."apiKeyAddedAt", CURRENT_TIMESTAMP),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Organization" AS organization
WHERE organization."apiKeyCiphertext" IS NOT NULL
  AND organization."apiKeyIv" IS NOT NULL
  AND organization."apiKeyProvider" IS NOT NULL;

ALTER TABLE "Organization" DROP CONSTRAINT IF EXISTS "Organization_apiKeyAddedById_fkey";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "apiKeyCiphertext";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "apiKeyIv";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "apiKeyProvider";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "defaultModel";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "apiKeyAddedAt";
ALTER TABLE "Organization" DROP COLUMN IF EXISTS "apiKeyAddedById";
