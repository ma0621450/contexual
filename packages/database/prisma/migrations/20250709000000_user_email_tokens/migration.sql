-- AlterTable
ALTER TABLE "User" ADD COLUMN "emailVerificationOtpHash" TEXT,
ADD COLUMN "emailVerificationOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN "passwordResetTokenHash" TEXT,
ADD COLUMN "passwordResetTokenExpiresAt" TIMESTAMP(3);
