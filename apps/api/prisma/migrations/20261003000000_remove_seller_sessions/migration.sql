-- Sellers are managed as employees now: drop every session that was started with the Seller role.
-- Harvests, adjustments and audit rows cascade; sales and income rows keep their data and lose the session link (SET NULL).
DELETE FROM "WorkSession" WHERE "role" = 'SELLER';
