-- AlterEnum
ALTER TYPE "WorkspaceStatus" ADD VALUE IF NOT EXISTS 'DELETED';

-- CreateTable
CREATE TABLE "EnterpriseCompliancePolicy" (
    "id" TEXT NOT NULL,
    "enterpriseId" TEXT NOT NULL,
    "logRetentionDays" INTEGER NOT NULL DEFAULT 90,
    "requireStrongPasswords" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnterpriseCompliancePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnterpriseCompliancePolicy_enterpriseId_key" ON "EnterpriseCompliancePolicy"("enterpriseId");

-- CreateIndex
CREATE INDEX "EnterpriseCompliancePolicy_enterpriseId_idx" ON "EnterpriseCompliancePolicy"("enterpriseId");

-- AddForeignKey
ALTER TABLE "EnterpriseCompliancePolicy" ADD CONSTRAINT "EnterpriseCompliancePolicy_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
