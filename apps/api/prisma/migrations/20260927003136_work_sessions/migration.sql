-- Work Sessions replace Work Seasons. Loan / Deficit are no longer POS payment methods
-- (they live only in Loan & Deficit), so any sale recorded with them becomes a plain cash sale.
UPDATE "Sale" SET "paymentMethod" = 'CASH' WHERE "paymentMethod" IN ('LOAN', 'DEFICIT');

-- CreateEnum
CREATE TYPE "SessionRole" AS ENUM ('SELLER', 'EMPLOYEE', 'PARTNER');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "HarvestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentMethod_new" AS ENUM ('CASH', 'CARD', 'EBT', 'ZELLE');
ALTER TABLE "Sale" ALTER COLUMN "paymentMethod" TYPE "PaymentMethod_new" USING ("paymentMethod"::text::"PaymentMethod_new");
ALTER TYPE "PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "public"."PaymentMethod_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "CapitalEntry" DROP CONSTRAINT "CapitalEntry_performedById_fkey";

-- DropForeignKey
ALTER TABLE "CapitalEntry" DROP CONSTRAINT "CapitalEntry_seasonId_fkey";

-- AlterTable
ALTER TABLE "CashTransaction" ADD COLUMN     "sessionId" TEXT;

-- AlterTable
ALTER TABLE "Sale" DROP COLUMN "debtId",
ADD COLUMN     "sessionId" TEXT;

-- DropTable
DROP TABLE "CapitalEntry";

-- DropTable
DROP TABLE "WorkSeason";

-- DropEnum
DROP TYPE "CapitalEntryType";

-- DropEnum
DROP TYPE "SeasonStatus";

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "role" "SessionRole" NOT NULL,
    "sellerProfileId" TEXT,
    "employeeId" TEXT,
    "partnerId" TEXT,
    "personName" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "openingCash" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "harvestLimit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingNotes" TEXT,
    "closedAt" TIMESTAMP(3),
    "actualClosingCash" DECIMAL(18,2),
    "expectedClosingCash" DECIMAL(18,2),
    "closingNotes" TEXT,
    "createdById" TEXT NOT NULL,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashHarvest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "sessionId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "IncomePart" NOT NULL DEFAULT 'CASH',
    "status" "HarvestStatus" NOT NULL DEFAULT 'APPROVED',
    "note" TEXT,
    "harvestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" TEXT NOT NULL,
    "collectedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashHarvest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSessionAudit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkSessionAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkSession_tenantId_status_idx" ON "WorkSession"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WorkSession_tenantId_startedAt_idx" ON "WorkSession"("tenantId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSession_tenantId_code_key" ON "WorkSession"("tenantId", "code");

-- CreateIndex
CREATE INDEX "CashHarvest_sessionId_status_idx" ON "CashHarvest"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CashHarvest_tenantId_number_key" ON "CashHarvest"("tenantId", "number");

-- CreateIndex
CREATE INDEX "SessionAdjustment_sessionId_idx" ON "SessionAdjustment"("sessionId");

-- CreateIndex
CREATE INDEX "WorkSessionAudit_sessionId_createdAt_idx" ON "WorkSessionAudit"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "CashTransaction_sessionId_idx" ON "CashTransaction"("sessionId");

-- CreateIndex
CREATE INDEX "Sale_sessionId_idx" ON "Sale"("sessionId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_sellerProfileId_fkey" FOREIGN KEY ("sellerProfileId") REFERENCES "SellerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHarvest" ADD CONSTRAINT "CashHarvest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHarvest" ADD CONSTRAINT "CashHarvest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashHarvest" ADD CONSTRAINT "CashHarvest_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAdjustment" ADD CONSTRAINT "SessionAdjustment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionAdjustment" ADD CONSTRAINT "SessionAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSessionAudit" ADD CONSTRAINT "WorkSessionAudit_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "WorkSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSessionAudit" ADD CONSTRAINT "WorkSessionAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Permissions / modules of the removed Work Season feature
DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "key" LIKE 'work_season.%');
DELETE FROM "Permission" WHERE "key" LIKE 'work_season.%';
DELETE FROM "TenantModule" WHERE "moduleId" IN (SELECT "id" FROM "Module" WHERE "key" = 'work-season');
DELETE FROM "Module" WHERE "key" = 'work-season';
