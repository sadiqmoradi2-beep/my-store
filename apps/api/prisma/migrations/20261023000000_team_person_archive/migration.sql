-- Financial Personnel delete: a person still referenced by financial history is archived, never removed.
ALTER TABLE "TeamPerson" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- Name uniqueness applies to people still in use; an archived name can be registered again.
-- (Index rebuild only — no row is changed.)
DROP INDEX "TeamPerson_tenant_name_key";
CREATE UNIQUE INDEX "TeamPerson_tenant_name_key" ON "TeamPerson" ("tenantId", lower(btrim("displayName"))) WHERE "archivedAt" IS NULL;

-- An archived person is never active
ALTER TABLE "TeamPerson" ADD CONSTRAINT "TeamPerson_archived_inactive" CHECK ("archivedAt" IS NULL OR "isActive" = false);
