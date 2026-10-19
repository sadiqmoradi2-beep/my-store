-- Internal transfers between a store's own accounts. Additive: new enum values + a new table; no existing row changes.
-- (ADD VALUE is safe inside the migration transaction because nothing uses the new values in it.)
ALTER TYPE "CashTransactionType" ADD VALUE 'TRANSFER_IN';
ALTER TYPE "CashTransactionType" ADD VALUE 'TRANSFER_OUT';

CREATE TABLE "CashTransfer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fromRegisterId" TEXT NOT NULL,
    "toRegisterId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "transferredByPersonId" TEXT,
    "transferredByName" TEXT NOT NULL,
    "note" TEXT,
    "performedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversalOfId" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "CashTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashTransfer_reversalOfId_key" ON "CashTransfer"("reversalOfId");
CREATE INDEX "CashTransfer_tenantId_createdAt_idx" ON "CashTransfer"("tenantId", "createdAt");
CREATE UNIQUE INDEX "CashTransfer_tenantId_requestId_key" ON "CashTransfer"("tenantId", "requestId");

ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_fromRegisterId_fkey" FOREIGN KEY ("fromRegisterId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_toRegisterId_fkey" FOREIGN KEY ("toRegisterId") REFERENCES "CashRegister"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_transferredByPersonId_fkey" FOREIGN KEY ("transferredByPersonId") REFERENCES "TeamPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- an internal transfer moves a positive amount between two different accounts
ALTER TABLE "CashTransfer" ADD CONSTRAINT "CashTransfer_valid" CHECK ("amount" > 0 AND "fromRegisterId" <> "toRegisterId");
