-- AlterTable
ALTER TABLE "AdminLog" ADD COLUMN     "actorRole" "AdminRole",
ADD COLUMN     "immutable" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "retentionUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrgAnalytics" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "deleteReason" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "deletedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "deletedAt" TIMESTAMP(3);
