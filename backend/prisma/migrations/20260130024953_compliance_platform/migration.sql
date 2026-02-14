-- CreateEnum
CREATE TYPE "ComplianceIncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ComplianceIncidentStatus" AS ENUM ('OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ComplianceExportType" AS ENUM ('AUDIT_LOGS', 'INCIDENTS', 'ORG_HISTORY', 'USER_ACTIONS', 'DELETION_RECORDS');

-- CreateEnum
CREATE TYPE "ComplianceExportFormat" AS ENUM ('CSV', 'JSON');

-- CreateEnum
CREATE TYPE "RetentionEntityType" AS ENUM ('AUDIT_LOG', 'REQUEST', 'REPORT', 'ANALYTICS', 'EXPORT', 'ORGANIZATION', 'USER');

-- CreateTable
CREATE TABLE "ComplianceIncident" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "ComplianceIncidentSeverity" NOT NULL DEFAULT 'LOW',
    "status" "ComplianceIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "relatedEntity" TEXT,
    "relatedId" TEXT,
    "reportedBy" TEXT,
    "assignedTo" TEXT,
    "timeline" JSONB,
    "resolution" TEXT,
    "evidenceLinks" JSONB,
    "auditLogIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceExport" (
    "id" TEXT NOT NULL,
    "type" "ComplianceExportType" NOT NULL,
    "format" "ComplianceExportFormat" NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "requestedByRole" "AdminRole",
    "filters" JSONB,
    "checksum" TEXT,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionPolicy" (
    "id" TEXT NOT NULL,
    "entityType" "RetentionEntityType" NOT NULL,
    "retentionDays" INTEGER NOT NULL DEFAULT 365,
    "autoPurge" BOOLEAN NOT NULL DEFAULT false,
    "archiveBeforeDelete" BOOLEAN NOT NULL DEFAULT false,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceIncident_status_idx" ON "ComplianceIncident"("status");

-- CreateIndex
CREATE INDEX "ComplianceIncident_severity_idx" ON "ComplianceIncident"("severity");

-- CreateIndex
CREATE INDEX "ComplianceIncident_relatedEntity_idx" ON "ComplianceIncident"("relatedEntity");

-- CreateIndex
CREATE INDEX "ComplianceExport_type_idx" ON "ComplianceExport"("type");

-- CreateIndex
CREATE INDEX "ComplianceExport_requestedBy_idx" ON "ComplianceExport"("requestedBy");

-- CreateIndex
CREATE INDEX "ComplianceExport_createdAt_idx" ON "ComplianceExport"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RetentionPolicy_entityType_key" ON "RetentionPolicy"("entityType");
