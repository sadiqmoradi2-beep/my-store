-- Remove the system CUSTOMER role (no users use it once customer accounts are gone)
DELETE FROM "RolePermission" WHERE "roleId" IN (SELECT id FROM "Role" WHERE key = 'CUSTOMER' AND "tenantId" IS NULL);
DELETE FROM "Role" WHERE key = 'CUSTOMER' AND "tenantId" IS NULL;

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_discountId_fkey";

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Customer" DROP CONSTRAINT "Customer_userId_fkey";

-- DropForeignKey
ALTER TABLE "Discount" DROP CONSTRAINT "Discount_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "LotteryCampaign" DROP CONSTRAINT "LotteryCampaign_createdById_fkey";

-- DropForeignKey
ALTER TABLE "LotteryDraw" DROP CONSTRAINT "LotteryDraw_campaignId_fkey";

-- DropForeignKey
ALTER TABLE "LotteryDraw" DROP CONSTRAINT "LotteryDraw_drawnById_fkey";

-- DropForeignKey
ALTER TABLE "LotteryDraw" DROP CONSTRAINT "LotteryDraw_winnerCustomerId_fkey";

-- DropForeignKey
ALTER TABLE "LoyaltyTransaction" DROP CONSTRAINT "LoyaltyTransaction_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_customerId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_discountId_fkey";

-- DropForeignKey
ALTER TABLE "OrderReturn" DROP CONSTRAINT "OrderReturn_branchId_fkey";

-- DropForeignKey
ALTER TABLE "OrderReturn" DROP CONSTRAINT "OrderReturn_createdById_fkey";

-- DropForeignKey
ALTER TABLE "OrderReturn" DROP CONSTRAINT "OrderReturn_customerId_fkey";

-- DropForeignKey
ALTER TABLE "OrderReturn" DROP CONSTRAINT "OrderReturn_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderReturnItem" DROP CONSTRAINT "OrderReturnItem_returnId_fkey";

-- DropForeignKey
ALTER TABLE "WishlistItem" DROP CONSTRAINT "WishlistItem_customerId_fkey";

-- DropForeignKey
ALTER TABLE "WishlistItem" DROP CONSTRAINT "WishlistItem_productId_fkey";

-- AlterTable
ALTER TABLE "Cart" DROP COLUMN "customerId",
DROP COLUMN "discountId",
DROP COLUMN "manualDiscount";

-- AlterTable
ALTER TABLE "Debt" DROP COLUMN "customerId";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "couponDiscount",
DROP COLUMN "customerId",
DROP COLUMN "discountCode",
DROP COLUMN "discountId",
DROP COLUMN "manualDiscount",
DROP COLUMN "pointsEarned",
DROP COLUMN "pointsRedeemed",
DROP COLUMN "redeemDiscount";

-- DropTable
DROP TABLE "Customer";

-- DropTable
DROP TABLE "Discount";

-- DropTable
DROP TABLE "LotteryCampaign";

-- DropTable
DROP TABLE "LotteryDraw";

-- DropTable
DROP TABLE "LoyaltyTransaction";

-- DropTable
DROP TABLE "OrderReturn";

-- DropTable
DROP TABLE "OrderReturnItem";

-- DropTable
DROP TABLE "WishlistItem";

-- DropEnum
DROP TYPE "DiscountBasis";

-- DropEnum
DROP TYPE "DiscountType";

-- DropEnum
DROP TYPE "LotteryCriteria";

-- DropEnum
DROP TYPE "LotteryPeriodType";

-- DropEnum
DROP TYPE "LoyaltyTxType";

