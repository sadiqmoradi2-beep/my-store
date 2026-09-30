-- AlterEnum
-- Renames the DEBT payment method to DEBIT_CARD. Postgres updates existing Sale rows using this
-- value automatically — no data migration needed. Any Debt/DebtPayment records already created by
-- a DEBT-method sale (referenceType='sale') are untouched; they remain valid receivables in Loans
-- & Deficit, since the concept they represent (a real amount owed) doesn't retroactively disappear.
ALTER TYPE "PaymentMethod" RENAME VALUE 'DEBT' TO 'DEBIT_CARD';

-- AlterEnum
-- Debit Card is now immediate income like Cash/EBT/Zelle, so it needs its own Income part/register.
ALTER TYPE "IncomePart" ADD VALUE 'DEBIT_CARD';
