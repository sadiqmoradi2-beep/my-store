-- Debit Card is shown as "System". Label only: the account keeps its id, part code (DEBIT_CARD), balance,
-- transactions and every link. Only accounts still carrying the default name are renamed; custom names are kept.
UPDATE "CashRegister" SET "name" = 'System', "updatedAt" = CURRENT_TIMESTAMP
WHERE "part" = 'DEBIT_CARD' AND "name" = 'Debit Card';
