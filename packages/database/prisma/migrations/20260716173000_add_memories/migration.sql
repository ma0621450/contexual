CREATE TYPE "MemoryScope" AS ENUM ('USER', 'ORGANIZATION');

CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "scope" "MemoryScope" NOT NULL DEFAULT 'USER',
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Memory_scope_owner_check" CHECK (
        ("scope" = 'USER' AND "userId" IS NOT NULL)
        OR ("scope" = 'ORGANIZATION' AND "userId" IS NULL)
    )
);

CREATE INDEX "Memory_organizationId_scope_enabled_idx"
ON "Memory"("organizationId", "scope", "enabled");

CREATE INDEX "Memory_organizationId_userId_enabled_idx"
ON "Memory"("organizationId", "userId", "enabled");

ALTER TABLE "Memory"
ADD CONSTRAINT "Memory_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Memory"
ADD CONSTRAINT "Memory_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
