-- Paid By / Who Is Paid + Team People (additive only: one new table, nullable columns on CashTransaction)

CREATE TABLE "TeamPerson" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamPerson_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CashTransaction" ADD COLUMN     "paidByEmployeeId" TEXT,
ADD COLUMN     "paidByKind" TEXT,
ADD COLUMN     "paidByName" TEXT,
ADD COLUMN     "paidByPartnerId" TEXT,
ADD COLUMN     "paidByPersonId" TEXT,
ADD COLUMN     "receivedByEmployeeId" TEXT,
ADD COLUMN     "receivedByKind" TEXT,
ADD COLUMN     "receivedByName" TEXT,
ADD COLUMN     "receivedByPartnerId" TEXT,
ADD COLUMN     "receivedByPersonId" TEXT;

CREATE INDEX "TeamPerson_tenantId_isActive_idx" ON "TeamPerson"("tenantId", "isActive");
CREATE INDEX "CashTransaction_paidByEmployeeId_idx" ON "CashTransaction"("paidByEmployeeId");
CREATE INDEX "CashTransaction_paidByPartnerId_idx" ON "CashTransaction"("paidByPartnerId");
CREATE INDEX "CashTransaction_paidByPersonId_idx" ON "CashTransaction"("paidByPersonId");
CREATE INDEX "CashTransaction_receivedByEmployeeId_idx" ON "CashTransaction"("receivedByEmployeeId");
CREATE INDEX "CashTransaction_receivedByPartnerId_idx" ON "CashTransaction"("receivedByPartnerId");
CREATE INDEX "CashTransaction_receivedByPersonId_idx" ON "CashTransaction"("receivedByPersonId");
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_paidByEmployeeId_fkey" FOREIGN KEY ("paidByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_paidByPartnerId_fkey" FOREIGN KEY ("paidByPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_paidByPersonId_fkey" FOREIGN KEY ("paidByPersonId") REFERENCES "TeamPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_receivedByEmployeeId_fkey" FOREIGN KEY ("receivedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_receivedByPartnerId_fkey" FOREIGN KEY ("receivedByPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_receivedByPersonId_fkey" FOREIGN KEY ("receivedByPersonId") REFERENCES "TeamPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A side points to at most one person (an employee OR a partner OR a team person)
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_paid_by_one_person"
  CHECK (num_nonnulls("paidByEmployeeId", "paidByPartnerId", "paidByPersonId") <= 1);
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_received_by_one_person"
  CHECK (num_nonnulls("receivedByEmployeeId", "receivedByPartnerId", "receivedByPersonId") <= 1);
-- Kind snapshot is one of the three known kinds
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_person_kinds"
  CHECK (("paidByKind" IS NULL OR "paidByKind" IN ('EMPLOYEE', 'PARTNER', 'PERSON'))
     AND ("receivedByKind" IS NULL OR "receivedByKind" IN ('EMPLOYEE', 'PARTNER', 'PERSON')));
-- No two people with the same name (ignoring case and outer spaces) in one store
CREATE UNIQUE INDEX "TeamPerson_tenant_name_key" ON "TeamPerson" ("tenantId", lower(btrim("displayName")));
