-- Simplify the order lifecycle to PENDING -> APPROVED -> DELIVERED (+ CANCELLED):
-- intermediate fulfillment steps (READY / SHIPPING) collapse into APPROVED
DELETE FROM "OrderStatusHistory" WHERE "toStatus" IN ('READY', 'SHIPPING', 'RETURNED');
UPDATE "OrderStatusHistory" SET "fromStatus" = 'APPROVED' WHERE "fromStatus" IN ('READY', 'SHIPPING');
UPDATE "OrderStatusHistory" SET "fromStatus" = 'DELIVERED' WHERE "fromStatus" = 'RETURNED';
UPDATE "Order" SET "status" = 'APPROVED' WHERE "status" IN ('READY', 'SHIPPING');
UPDATE "Order" SET "status" = 'CANCELLED' WHERE "status" = 'RETURNED';

-- Remove permissions and modules of features that no longer exist
DELETE FROM "RolePermission" WHERE "permissionId" IN (SELECT id FROM "Permission" WHERE key LIKE 'customers.%' OR key LIKE 'lottery.%' OR key LIKE 'discounts.%');
DELETE FROM "Permission" WHERE key LIKE 'customers.%' OR key LIKE 'lottery.%' OR key LIKE 'discounts.%';
DELETE FROM "TenantModule" WHERE "moduleId" IN (SELECT id FROM "Module" WHERE key IN ('customers', 'wishlist', 'loyalty', 'lottery', 'discounts'));
DELETE FROM "Module" WHERE key IN ('customers', 'wishlist', 'loyalty', 'lottery', 'discounts');

-- AlterEnum
BEGIN;
CREATE TYPE "GatewayPurpose_new" AS ENUM ('SUBSCRIPTION');
ALTER TABLE "GatewayIntent" ALTER COLUMN "purpose" TYPE "GatewayPurpose_new" USING ("purpose"::text::"GatewayPurpose_new");
ALTER TYPE "GatewayPurpose" RENAME TO "GatewayPurpose_old";
ALTER TYPE "GatewayPurpose_new" RENAME TO "GatewayPurpose";
DROP TYPE "public"."GatewayPurpose_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'APPROVED', 'DELIVERED', 'CANCELLED');
ALTER TABLE "public"."Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "fromStatus" TYPE "OrderStatus_new" USING ("fromStatus"::text::"OrderStatus_new");
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "toStatus" TYPE "OrderStatus_new" USING ("toStatus"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "public"."OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "fulfillmentType",
DROP COLUMN "paymentMethod";

-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "method",
DROP COLUMN "provider",
DROP COLUMN "providerRef";

-- DropEnum
DROP TYPE "FulfillmentType";

-- DropEnum
DROP TYPE "PaymentMethod";

