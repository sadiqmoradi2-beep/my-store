-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing purchases: the goods arrived when the purchase was recorded
UPDATE "Purchase" SET "receivedAt" = "createdAt";
