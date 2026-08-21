-- Three hand-written migrations gave "updatedAt" a CURRENT_TIMESTAMP default,
-- which ADD COLUMN needs to backfill existing rows but which the Prisma schema
-- never declared. The mismatch made every `migrate dev` report drift and prompt
-- for a new migration. Prisma writes @updatedAt on create and update itself, so
-- removing the defaults changes no behaviour.

ALTER TABLE "StoredFile" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "FileProcessingJob" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "OrganizationProvider" ALTER COLUMN "updatedAt" DROP DEFAULT;
