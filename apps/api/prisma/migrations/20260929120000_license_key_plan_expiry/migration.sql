-- AlterTable
ALTER TABLE "LicenseKey" ADD COLUMN "planId" TEXT,
ADD COLUMN "expiresAt" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "LicenseKey" ADD CONSTRAINT "LicenseKey_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
