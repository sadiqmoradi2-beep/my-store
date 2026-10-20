-- Attribution only. Historical rows remain unknown; no balance or monetary rows are changed.
ALTER TABLE "CashTransaction" ADD COLUMN "staffActorPersonId" TEXT,
    ADD COLUMN "staffActorName" TEXT,
    ADD COLUMN "destination" TEXT;
CREATE INDEX "CashTransaction_staffActorPersonId_idx" ON "CashTransaction"("staffActorPersonId");
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_staffActorPersonId_fkey"
    FOREIGN KEY ("staffActorPersonId") REFERENCES "TeamPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;
