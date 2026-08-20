-- Platform staff move off the customer User table and onto credentials of their
-- own, so no customer-facing flow (password reset in particular) can reach a
-- staff credential. PlatformAdmin holds no rows yet, so this is a plain
-- rewrite rather than a backfill.

DELETE FROM "PlatformAdmin";

ALTER TABLE "PlatformAdmin" DROP CONSTRAINT "PlatformAdmin_userId_fkey";
DROP INDEX "PlatformAdmin_userId_key";
ALTER TABLE "PlatformAdmin" DROP COLUMN "userId";

ALTER TABLE "PlatformAdmin" ADD COLUMN "email" TEXT NOT NULL;
ALTER TABLE "PlatformAdmin" ADD COLUMN "name" TEXT NOT NULL;
ALTER TABLE "PlatformAdmin" ADD COLUMN "passwordHash" TEXT NOT NULL;
ALTER TABLE "PlatformAdmin" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PlatformAdmin" ADD COLUMN "ssoSubject" TEXT;

CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");
CREATE UNIQUE INDEX "PlatformAdmin_ssoSubject_key" ON "PlatformAdmin"("ssoSubject");
