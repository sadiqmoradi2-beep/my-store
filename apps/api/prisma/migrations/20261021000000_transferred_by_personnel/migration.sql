-- Financial Personnel: who transferred the money (attribution only). Additive; existing rows stay NULL.
ALTER TABLE "CashTransaction" ADD COLUMN "transferredByPersonId" TEXT;
ALTER TABLE "CashTransaction" ADD COLUMN "transferredByName" TEXT;

CREATE INDEX "CashTransaction_transferredByPersonId_idx" ON "CashTransaction"("transferredByPersonId");

-- SET NULL: deactivating is the normal path, but if a person row is ever removed the name snapshot stays
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_transferredByPersonId_fkey" FOREIGN KEY ("transferredByPersonId") REFERENCES "TeamPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- a transferred-by link always carries its name snapshot
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_transferred_by_named" CHECK ("transferredByPersonId" IS NULL OR "transferredByName" IS NOT NULL) NOT VALID;
