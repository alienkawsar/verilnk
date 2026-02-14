-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'BASIC', 'PRO', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SupportTier" AS ENUM ('NONE', 'EMAIL', 'CHAT', 'INSTANT', 'DEDICATED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "planType" "PlanType" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "planStatus" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "planStartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "planEndAt" TIMESTAMP(3),
ADD COLUMN     "supportTier" "SupportTier" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "priorityOverride" INTEGER;
