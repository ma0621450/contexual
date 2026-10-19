-- Workspace profile captured during onboarding.
CREATE TYPE "OrganizationType" AS ENUM ('DESIGN_AGENCY', 'CREATIVE_STUDIO', 'BRAND_CONSULTANCY', 'UX_RESEARCH_FIRM');
CREATE TYPE "TeamSize" AS ENUM ('JUST_ME', 'SIZE_2_10', 'SIZE_11_25', 'SIZE_26_100', 'SIZE_100_PLUS');

ALTER TABLE "Organization"
  ADD COLUMN "organizationType" "OrganizationType",
  ADD COLUMN "teamSize" "TeamSize";

-- Hash of the secret that is only delivered inside the invitation email.
-- Existing invites keep NULL and fall back to email-code verification.
ALTER TABLE "Invite" ADD COLUMN "emailProofHash" TEXT;
