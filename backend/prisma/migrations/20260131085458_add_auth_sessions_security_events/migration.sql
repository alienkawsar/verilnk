-- CreateEnum
CREATE TYPE "SessionActorType" AS ENUM ('ADMIN', 'ORG');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('SUSPICIOUS_LOGIN', 'FAILED_LOGIN', 'FAILED_LOGIN_BURST', 'NEW_DEVICE', 'NEW_IP', 'MULTI_SESSION');

-- CreateEnum
CREATE TYPE "SecurityEventSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "actorType" "SessionActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "role" "AdminRole",
    "organizationId" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "actorType" "SessionActorType" NOT NULL,
    "actorId" TEXT NOT NULL,
    "eventType" "SecurityEventType" NOT NULL,
    "severity" "SecurityEventSeverity" NOT NULL DEFAULT 'LOW',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_jti_key" ON "AuthSession"("jti");

-- CreateIndex
CREATE INDEX "AuthSession_actorType_idx" ON "AuthSession"("actorType");

-- CreateIndex
CREATE INDEX "AuthSession_actorId_idx" ON "AuthSession"("actorId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_revokedAt_idx" ON "AuthSession"("revokedAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_actorType_idx" ON "SecurityEvent"("actorType");

-- CreateIndex
CREATE INDEX "SecurityEvent_actorId_idx" ON "SecurityEvent"("actorId");

-- CreateIndex
CREATE INDEX "SecurityEvent_eventType_idx" ON "SecurityEvent"("eventType");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt");
