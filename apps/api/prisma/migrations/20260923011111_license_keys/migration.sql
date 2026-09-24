-- CreateEnum
CREATE TYPE "LicenseKeyStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED');

-- CreateTable
CREATE TABLE "LicenseKey" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "LicenseKeyStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "usedByTenantId" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LicenseKey_key_key" ON "LicenseKey"("key");

-- CreateIndex
CREATE INDEX "LicenseKey_status_idx" ON "LicenseKey"("status");

-- CreateIndex
CREATE INDEX "LicenseKey_usedByTenantId_idx" ON "LicenseKey"("usedByTenantId");

-- AddForeignKey
ALTER TABLE "LicenseKey" ADD CONSTRAINT "LicenseKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseKey" ADD CONSTRAINT "LicenseKey_usedByTenantId_fkey" FOREIGN KEY ("usedByTenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
