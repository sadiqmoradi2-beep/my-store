-- Duplicate Income accounts (same store + branch + part) were created when two requests set up a
-- branch's accounts at the same time. Keep one per part: the account holding data wins (most
-- transactions, then largest balance, then oldest). Nothing is deleted:
--   * a duplicate with no transactions, zero balance and no references is hidden (isActive = false);
--   * a duplicate that holds data stays visible, it only stops being the default.
WITH ranked AS (
  SELECT r.id,
         ROW_NUMBER() OVER (
           PARTITION BY r."tenantId", r."branchId", r."part"
           ORDER BY (SELECT count(*) FROM "CashTransaction" t WHERE t."registerId" = r.id) DESC,
                    abs(r."balance") DESC,
                    r."createdAt" ASC,
                    r.id ASC
         ) AS rn
  FROM "CashRegister" r
  WHERE r."isActive" = true AND r."isDefault" = true
)
UPDATE "CashRegister" r
SET "isDefault" = false,
    "isActive" = CASE
      WHEN r."balance" = 0
       AND r."openingBalance" = 0
       AND NOT EXISTS (SELECT 1 FROM "CashTransaction" t WHERE t."registerId" = r.id)
       AND NOT EXISTS (SELECT 1 FROM "Sale" s WHERE s."registerId" = r.id)
       AND NOT EXISTS (SELECT 1 FROM "SalaryPayment" sp WHERE sp."registerId" = r.id)
       AND NOT EXISTS (SELECT 1 FROM "SellerSalaryPayment" ssp WHERE ssp."registerId" = r.id)
       AND NOT EXISTS (SELECT 1 FROM "EmployeeShift" es WHERE es."registerId" = r.id)
       AND NOT EXISTS (SELECT 1 FROM "DebtPayment" dp WHERE dp."registerId" = r.id)
      THEN false
      ELSE r."isActive"
    END,
    "updatedAt" = now()
FROM ranked
WHERE r.id = ranked.id AND ranked.rn > 1;

-- From now on the database itself allows only one active default account per store + branch + part
CREATE UNIQUE INDEX "CashRegister_one_default_per_part"
  ON "CashRegister" ("tenantId", "branchId", "part")
  WHERE "isDefault" = true AND "isActive" = true;
