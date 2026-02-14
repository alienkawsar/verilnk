-- CreateEnum
CREATE TYPE "EnterpriseOrgLinkRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'CANCELED');

-- CreateTable
CREATE TABLE "EnterpriseOrgLinkRequest" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "organizationId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "requestIdentifier" TEXT,
    "message" TEXT,
    "status" "EnterpriseOrgLinkRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedAt" TIMESTAMP(3),
    "decisionByOrgUserId" TEXT,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseOrgLinkRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnterpriseOrgLinkRequest_enterpriseId_idx" ON "EnterpriseOrgLinkRequest"("enterpriseId");

-- CreateIndex
CREATE INDEX "EnterpriseOrgLinkRequest_organizationId_idx" ON "EnterpriseOrgLinkRequest"("organizationId");

-- CreateIndex
CREATE INDEX "EnterpriseOrgLinkRequest_workspaceId_idx" ON "EnterpriseOrgLinkRequest"("workspaceId");

-- CreateIndex
CREATE INDEX "EnterpriseOrgLinkRequest_status_idx" ON "EnterpriseOrgLinkRequest"("status");

-- CreateIndex
CREATE INDEX "EnterpriseOrgLinkRequest_enterpriseId_status_idx" ON "EnterpriseOrgLinkRequest"("enterpriseId", "status");

-- CreateIndex
CREATE INDEX "EnterpriseOrgLinkRequest_organizationId_status_idx" ON "EnterpriseOrgLinkRequest"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "EnterpriseOrgLinkRequest" ADD CONSTRAINT "EnterpriseOrgLinkRequest_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseOrgLinkRequest" ADD CONSTRAINT "EnterpriseOrgLinkRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnterpriseOrgLinkRequest" ADD CONSTRAINT "EnterpriseOrgLinkRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
