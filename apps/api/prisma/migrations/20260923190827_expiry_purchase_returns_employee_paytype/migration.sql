-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'RETURN_OUT';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "payType" "SellerPayType" NOT NULL DEFAULT 'FIXED_SALARY';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "lastExpiryAlertAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PurchaseReturn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseReturn_tenantId_createdAt_idx" ON "PurchaseReturn"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseReturn_supplierId_idx" ON "PurchaseReturn"("supplierId");

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReturn" ADD CONSTRAINT "PurchaseReturn_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
