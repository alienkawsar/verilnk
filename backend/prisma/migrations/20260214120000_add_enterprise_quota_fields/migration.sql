ALTER TABLE "Organization"
    ADD COLUMN "enterpriseMaxWorkspaces" INTEGER,
    ADD COLUMN "enterpriseMaxLinkedOrgs" INTEGER,
    ADD COLUMN "enterpriseMaxApiKeys" INTEGER,
    ADD COLUMN "enterpriseMaxMembers" INTEGER;

UPDATE "Organization"
SET
    "enterpriseMaxWorkspaces" = COALESCE("enterpriseMaxWorkspaces", 10),
    "enterpriseMaxLinkedOrgs" = COALESCE("enterpriseMaxLinkedOrgs", 50),
    "enterpriseMaxApiKeys" = COALESCE("enterpriseMaxApiKeys", 10),
    "enterpriseMaxMembers" = COALESCE("enterpriseMaxMembers", 100)
WHERE "planType" = 'ENTERPRISE';
