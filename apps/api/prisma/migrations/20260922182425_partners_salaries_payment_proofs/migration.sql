-- CreateEnum
CREATE TYPE "SalaryPaymentStatus" AS ENUM ('PENDING', 'PAID');

-- CreateEnum
CREATE TYPE "PartnerEntryType" AS ENUM ('PROFIT', 'LOSS', 'WITHDRAWAL', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "DebtPayment" ADD COLUMN     "proofImageUrl" TEXT;

-- AlterTable
ALTER TABLE "SalaryPayment" ADD COLUMN     "bonus" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "status" "SalaryPaymentStatus" NOT NULL DEFAULT 'PAID';

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "sharePercent" DECIMAL(5,2),
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerLedgerEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "PartnerEntryType" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "period" TEXT,
    "method" TEXT,
    "note" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Partner_tenantId_idx" ON "Partner"("tenantId");

-- CreateIndex
CREATE INDEX "PartnerLedgerEntry_tenantId_createdAt_idx" ON "PartnerLedgerEntry"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerLedgerEntry_partnerId_idx" ON "PartnerLedgerEntry"("partnerId");

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLedgerEntry" ADD CONSTRAINT "PartnerLedgerEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerLedgerEntry" ADD CONSTRAINT "PartnerLedgerEntry_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
