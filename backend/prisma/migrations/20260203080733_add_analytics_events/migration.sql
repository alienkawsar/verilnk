-- CreateTable
CREATE TABLE "OrgAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "siteId" TEXT,
    "eventType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrgAnalyticsEvent_organizationId_idx" ON "OrgAnalyticsEvent"("organizationId");

-- CreateIndex
CREATE INDEX "OrgAnalyticsEvent_siteId_idx" ON "OrgAnalyticsEvent"("siteId");

-- CreateIndex
CREATE INDEX "OrgAnalyticsEvent_createdAt_idx" ON "OrgAnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "OrgAnalyticsEvent_organizationId_createdAt_idx" ON "OrgAnalyticsEvent"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "OrgAnalyticsEvent" ADD CONSTRAINT "OrgAnalyticsEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgAnalyticsEvent" ADD CONSTRAINT "OrgAnalyticsEvent_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
