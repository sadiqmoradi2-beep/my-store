-- Orders are replaced by simple Sales; Cash becomes Income (Cash / EBT / Zelle parts); Debts get a Loan / Deficit kind.

-- 1. New enums
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'EBT', 'ZELLE', 'LOAN', 'DEFICIT');
CREATE TYPE "IncomePart" AS ENUM ('CASH', 'EBT', 'ZELLE');
CREATE TYPE "DebtKind" AS ENUM ('LOAN', 'DEFICIT');

-- 2. New tables and columns
ALTER TABLE "CashRegister" ADD COLUMN "part" "IncomePart" NOT NULL DEFAULT 'CASH';
ALTER TABLE "Debt" ADD COLUMN "kind" "DebtKind" NOT NULL DEFAULT 'DEFICIT';

CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "saleNumber" INTEGER NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "registerId" TEXT,
    "debtId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Sale_tenantId_createdAt_idx" ON "Sale"("tenantId", "createdAt");
CREATE INDEX "Sale_tenantId_paymentMethod_createdAt_idx" ON "Sale"("tenantId", "paymentMethod", "createdAt");
CREATE UNIQUE INDEX "Sale_tenantId_saleNumber_key" ON "Sale"("tenantId", "saleNumber");
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");
CREATE INDEX "CashRegister_tenantId_part_idx" ON "CashRegister"("tenantId", "part");

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. Carry the data over: approved/delivered orders become sales (same ids, so old cash-transaction references still match)
INSERT INTO "Sale" ("id", "tenantId", "branchId", "saleNumber", "total", "cost", "paymentMethod", "registerId", "notes", "createdById", "createdAt")
SELECT o."id", o."tenantId", o."branchId", o."orderNumber", o."total",
       COALESCE((SELECT SUM(oi."unitCost" * oi."quantity") FROM "OrderItem" oi WHERE oi."orderId" = o."id"), 0),
       'CASH',
       (SELECT p."registerId" FROM "Payment" p WHERE p."orderId" = o."id" AND p."registerId" IS NOT NULL ORDER BY p."createdAt" LIMIT 1),
       o."notes", o."createdById", o."createdAt"
FROM "Order" o
WHERE o."status" IN ('APPROVED', 'DELIVERED');

INSERT INTO "SaleItem" ("id", "saleId", "productId", "productName", "quantity", "unitPrice", "unitCost", "total")
SELECT oi."id", oi."orderId", oi."productId", oi."productName", oi."quantity", oi."unitPrice", oi."unitCost", oi."total"
FROM "OrderItem" oi
JOIN "Sale" s ON s."id" = oi."orderId";

-- Commission entries keep their data, only the column names change
ALTER TABLE "CommissionEntry" RENAME COLUMN "orderId" TO "saleId";
ALTER TABLE "CommissionEntry" RENAME COLUMN "orderNumber" TO "saleNumber";
ALTER INDEX "CommissionEntry_sellerProfileId_orderId_key" RENAME TO "CommissionEntry_sellerProfileId_saleId_key";

-- Debts: money we owe = Deficit, money owed to us = Loan (existing rows)
UPDATE "Debt" SET "kind" = 'LOAN' WHERE "direction" = 'RECEIVABLE';

-- Income: the old "net profit" registers are retired; every branch gets one register per part (Cash / EBT / Zelle)
UPDATE "CashRegister" SET "isActive" = false, "isDefault" = false WHERE "isNetProfitBox" = true;

INSERT INTO "CashRegister" ("id", "tenantId", "branchId", "name", "isDefault", "isActive", "part", "openingBalance", "balance", "updatedAt")
SELECT 'c' || substr(md5(random()::text || clock_timestamp()::text || b."id" || p.part), 1, 24),
       b."tenantId", b."id", p.label, true, true, p.part::"IncomePart", 0, 0, CURRENT_TIMESTAMP
FROM "Branch" b
CROSS JOIN (VALUES ('CASH', 'Cash'), ('EBT', 'EBT'), ('ZELLE', 'Zelle')) AS p(part, label)
WHERE NOT EXISTS (
  SELECT 1 FROM "CashRegister" r
  WHERE r."branchId" = b."id" AND r."part" = p.part::"IncomePart" AND r."isActive" = true
);

-- 4. Remove the order system
ALTER TABLE "Order" DROP CONSTRAINT "Order_approvedById_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_branchId_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_createdById_fkey";
ALTER TABLE "Order" DROP CONSTRAINT "Order_tenantId_fkey";
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";
ALTER TABLE "OrderStatusHistory" DROP CONSTRAINT "OrderStatusHistory_changedById_fkey";
ALTER TABLE "OrderStatusHistory" DROP CONSTRAINT "OrderStatusHistory_orderId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_orderId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_receivedById_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_registerId_fkey";
DROP TABLE "OrderStatusHistory";
DROP TABLE "Payment";
DROP TABLE "OrderItem";
DROP TABLE "Order";
DROP TYPE "OrderPaymentStatus";
DROP TYPE "OrderStatus";
DROP TYPE "PaymentStatus";
ALTER TABLE "CashRegister" DROP COLUMN "isNetProfitBox";

-- 5. Permissions and modules: orders.read becomes sales.read; the other order/payment permissions go away
UPDATE "Permission" SET "key" = 'sales.read', "moduleKey" = 'sales' WHERE "key" = 'orders.read';
DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT "id" FROM "Permission" WHERE "key" LIKE 'orders.%' OR "key" LIKE 'payments.%');
DELETE FROM "Permission" WHERE "key" LIKE 'orders.%' OR "key" LIKE 'payments.%';
DELETE FROM "TenantModule" WHERE "moduleId" IN (SELECT "id" FROM "Module" WHERE "key" IN ('orders', 'payments'));
DELETE FROM "Module" WHERE "key" IN ('orders', 'payments');
