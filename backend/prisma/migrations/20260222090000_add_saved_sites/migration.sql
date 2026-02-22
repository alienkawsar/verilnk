-- CreateTable
CREATE TABLE "SavedSite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedSite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavedSite_userId_siteId_key" ON "SavedSite"("userId", "siteId");

-- CreateIndex
CREATE INDEX "SavedSite_userId_idx" ON "SavedSite"("userId");

-- CreateIndex
CREATE INDEX "SavedSite_siteId_idx" ON "SavedSite"("siteId");

-- AddForeignKey
ALTER TABLE "SavedSite" ADD CONSTRAINT "SavedSite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedSite" ADD CONSTRAINT "SavedSite_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
