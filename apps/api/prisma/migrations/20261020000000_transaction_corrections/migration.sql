-- Stage D: secure transaction editing. Additive only: no existing value is rewritten.

-- recordedAt: added WITHOUT a default first, so every existing row keeps NULL (= recording time unknown).
-- Only afterwards does the default apply, to rows inserted from now on. No timestamp is fabricated.
ALTER TABLE "CashTransaction" ADD COLUMN "recordedAt" TIMESTAMP(3);
ALTER TABLE "CashTransaction" ALTER COLUMN "recordedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "CashTransaction" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "CashTransaction" ADD COLUMN "correctionOfId" TEXT;
ALTER TABLE "CashTransaction" ADD COLUMN "correctionEditId" TEXT;

CREATE TABLE "CashTransactionEdit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "branchId" TEXT,
    "editorUserId" TEXT NOT NULL,
    "editorName" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "grantId" TEXT,
    "method" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "amountBefore" DECIMAL(18,2) NOT NULL,
    "amountAfter" DECIMAL(18,2) NOT NULL,
    "dateBefore" TIMESTAMP(3) NOT NULL,
    "dateAfter" TIMESTAMP(3) NOT NULL,
    "registerBeforeId" TEXT NOT NULL,
    "registerBeforeName" TEXT NOT NULL,
    "registerAfterId" TEXT NOT NULL,
    "registerAfterName" TEXT NOT NULL,
    "noteBefore" TEXT,
    "noteAfter" TEXT,
    "balanceChanges" JSONB NOT NULL,
    "entryIds" TEXT[],
    "recordedAtOfOriginal" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashTransactionEdit_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CashTransactionEditGrant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashTransactionEditGrant_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CashLedgerEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scope" TEXT,
    "backupId" TEXT,
    "backupCreatedAt" TIMESTAMP(3),
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashLedgerEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashTransactionEdit_tenantId_transactionId_idx" ON "CashTransactionEdit"("tenantId", "transactionId");
CREATE INDEX "CashTransactionEdit_tenantId_createdAt_idx" ON "CashTransactionEdit"("tenantId", "createdAt");
CREATE UNIQUE INDEX "CashTransactionEdit_tenantId_requestId_key" ON "CashTransactionEdit"("tenantId", "requestId");
CREATE INDEX "CashTransactionEditGrant_tenantId_transactionId_idx" ON "CashTransactionEditGrant"("tenantId", "transactionId");
CREATE INDEX "CashLedgerEvent_tenantId_createdAt_idx" ON "CashLedgerEvent"("tenantId", "createdAt");
CREATE INDEX "CashTransaction_correctionOfId_idx" ON "CashTransaction"("correctionOfId");
CREATE INDEX "CashTransaction_registerId_recordedAt_idx" ON "CashTransaction"("registerId", "recordedAt");

ALTER TABLE "CashTransactionEdit" ADD CONSTRAINT "CashTransactionEdit_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashTransactionEditGrant" ADD CONSTRAINT "CashTransactionEditGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashLedgerEvent" ADD CONSTRAINT "CashLedgerEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A correction entry points at its original. DEFERRABLE: a backup restore re-inserts rows in any order inside one transaction.
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_correctionOfId_fkey" FOREIGN KEY ("correctionOfId") REFERENCES "CashTransaction"("id") ON DELETE NO ACTION ON UPDATE NO ACTION DEFERRABLE INITIALLY DEFERRED;

-- A correction entry has the original's type and a non-zero signed amount; every other row stays positive
ALTER TABLE "CashTransaction" ADD CONSTRAINT "CashTransaction_amount_sign" CHECK (
  ("correctionOfId" IS NULL AND "amount" > 0) OR ("correctionOfId" IS NOT NULL AND "amount" <> 0)
) NOT VALID;
-- NOT VALID: existing rows are not re-checked (nothing historical is touched); new and updated rows are.

-- recordedAt is immutable once written
CREATE FUNCTION cash_tx_recorded_at_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW."recordedAt" IS DISTINCT FROM OLD."recordedAt" THEN
    RAISE EXCEPTION 'CashTransaction.recordedAt is immutable';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER cash_tx_recorded_at_immutable BEFORE UPDATE ON "CashTransaction"
  FOR EACH ROW EXECUTE FUNCTION cash_tx_recorded_at_immutable();

-- Correction history and ledger events are append-only. Only the permanent store deletion process
-- (which sets app.ledger_audit_purge = 'on' for its own transaction) may delete them.
CREATE FUNCTION ledger_audit_append_only() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND current_setting('app.ledger_audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER cash_tx_edit_append_only BEFORE UPDATE OR DELETE ON "CashTransactionEdit"
  FOR EACH ROW EXECUTE FUNCTION ledger_audit_append_only();
CREATE TRIGGER cash_ledger_event_append_only BEFORE UPDATE OR DELETE ON "CashLedgerEvent"
  FOR EACH ROW EXECUTE FUNCTION ledger_audit_append_only();

-- An exception grant can only be consumed once (usedAt NULL -> set); nothing else on it changes
CREATE FUNCTION cash_tx_grant_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.ledger_audit_purge', true) = 'on' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'CashTransactionEditGrant is append-only';
  END IF;
  IF OLD."usedAt" IS NOT NULL OR NEW."usedAt" IS NULL
     OR (NEW.id, NEW."tenantId", NEW."transactionId", NEW."userId", NEW."userName", NEW.reason, NEW."expiresAt", NEW."createdAt")
        IS DISTINCT FROM (OLD.id, OLD."tenantId", OLD."transactionId", OLD."userId", OLD."userName", OLD.reason, OLD."expiresAt", OLD."createdAt") THEN
    RAISE EXCEPTION 'An exception grant can only be used once';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER cash_tx_grant_guard BEFORE UPDATE OR DELETE ON "CashTransactionEditGrant"
  FOR EACH ROW EXECUTE FUNCTION cash_tx_grant_guard();
