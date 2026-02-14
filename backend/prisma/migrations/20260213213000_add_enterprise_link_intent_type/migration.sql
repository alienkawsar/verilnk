CREATE TYPE "EnterpriseOrgLinkIntentType" AS ENUM ('LINK_EXISTING', 'CREATE_UNDER_ENTERPRISE');

ALTER TABLE "EnterpriseOrgLinkRequest"
ADD COLUMN "intentType" "EnterpriseOrgLinkIntentType" NOT NULL DEFAULT 'LINK_EXISTING';

UPDATE "EnterpriseOrgLinkRequest"
SET "intentType" = 'CREATE_UNDER_ENTERPRISE'
WHERE "status" = 'PENDING_APPROVAL'
   OR "message" = 'Created by enterprise workspace. Pending super admin approval.';
