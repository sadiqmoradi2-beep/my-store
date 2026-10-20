# Financial Personnel attribution

`CashTransaction.performedById` and `CashTransfer.performedById` remain the authenticated User who submitted the operation. The transaction list also exposes `createdByUserId` as an alias of that existing FK; no duplicate User relationship is introduced.

`staffActorPersonId` and `staffActorName` identify the responsible Financial Personnel member separately from the existing payer/recipient relations. Internal transfers retain their existing `transferredByPersonId` relationship. Historical attribution is never inferred or backfilled.

Only an active User with the built-in system ADMIN role (`isSystem`, null role tenant, same User tenant) can select another active Financial Personnel actor. A custom role with key ADMIN does not qualify. Financial Personnel logins resolve their unique active TeamPerson link from the live database. Unlinked Cashier and Branch Manager logins retain their existing operation permissions and use their User identity without inventing a TeamPerson. Explicit forged actors, including legacy payer/collector aliases, are rejected before a monetary write. Linked users are restricted to accounts in their active branch. Permissions are re-read when recording the operation; a link never grants permissions.

For income, `paidBy` is an optional external payer and the staff member collects the money. For expense/withdrawal, `receivedBy` remains the actual recipient. Actor lists contain Financial Personnel only; recipient lists retain the existing Employee, Partner and TeamPerson choices. External parties are optional on every payment method, so a transaction needs no invented recipient. `destination` is an optional description of where payment went, not another account movement. Account-to-account transfers continue through the atomic transfer workflow.

Salary, seller/commission and partner payouts keep their original recipient and payment records. Their optional `paidByPersonId` is validated as a staff actor under their existing workflow permission, separately from the recipient. Hourly pay and deferred salary payments automatically resolve the operator's linked identity when recording their existing cash effect. Correction entries retain actor, payer/recipient and destination snapshots across payment methods. The old requirement to invent both parties when moving a correction to Cash is removed; edit windows, reconciliation, amounts, account locking and append-only audit checks remain in place.

Store Admin can link an active existing non-admin user by exact email through Team → Financial Personnel → Access → Link existing user. Both identities must belong to the same store, and the user needs an active branch. Links cannot be reassigned through this workflow. Linking changes only `TeamPerson.userId`: role, branch, name, credentials and permissions remain unchanged. The unique userId index prevents duplicate links. Shared-role permissions are managed in Users, not the per-person capability editor.

Deactivation or deletion revokes the linked login. It clears role permissions only for that person's own private FP role, never a shared Cashier/Branch Manager/custom role. Linked people and people referenced by financial history are archived; snapshots, payroll and transactions remain. Unlinked, unreferenced people can still be deleted after confirmation.

## Migration

`20261025000000_financial_actor` adds three nullable transaction columns, an index and a TeamPerson FK with `ON DELETE SET NULL`. It performs no backfill, monetary write or balance update. Existing backups automatically include the new columns through the current backup registry; older backups leave them null. Deletion checks include the new actor relationship, and name snapshots survive FK removal during existing reset workflows.

## Local verification

Run `npm test -w apps/api -- --runInBand` and `npm run build` from the repository root.

The standalone integration scripts refuse any database except `127.0.0.1:55439/financial_security`. Use a disposable PostgreSQL container with that database, apply the normal migration chain with an explicit local `DATABASE_URL`, and generate/build the API first. Then run:

```powershell
$env:DATABASE_URL='postgresql://financial_test:local_test_only@127.0.0.1:55439/financial_security'
node apps/api/test/financial-personnel.integration.cjs
node apps/api/test/financial-actor-migration.integration.cjs
```

The HTTP integration harness uses opaque fixture authentication tokens and the actual controllers, DTO validation, PermissionsGuard, services and PostgreSQL. It does not replace production authentication; the regular authentication unit suite remains part of verification. It tests forged actors, permission and branch rejection, onboarding, existing-user linking, revocation, shared roles, payroll/commission/partner/hourly payouts, transfer conservation/replay/concurrency/reversal, and corrections. The migration rehearsal compares complete historical fingerprints across eight populated tables and rolls its DDL rehearsal back fully.

For browser checks, serve the production web build at `http://127.0.0.1:55441`, install Playwright in the test environment (or set `PLAYWRIGHT_MODULE` to its installed module directory), and run `node apps/web/test/financial-personnel.browser.cjs`. The runner uses installed Chrome; `CHROME_PATH` overrides its default Windows location. Every external API request is mocked and unexpected requests fail the test. It covers built-in Admin, Financial Personnel, unlinked Cashier/Branch Manager and custom ADMIN forms, recipient separation, payroll attribution, transfers, linking, account creation controls and delete confirmation.

## Release gate

The Render blueprint runs migrations and seed automatically on deployment. Before pushing to main, confirm remote branch readiness and a usable current Production Neon recovery point covering current financial data. Local migration tests cannot establish that production recovery point. Do not push while recovery evidence is unavailable, and do not run production migrations or test transactions manually.

## Verification results (2026-10-20)

- API unit suite: 42 suites, 484 tests passed.
- PostgreSQL HTTP integration: 105 assertions passed, including concurrent linking, delete versus login enabling, and linking versus deactivation.
- Browser suite against the local production build: 37 checks passed; all external APIs mocked.
- Migration chain: all 32 migrations applied to the disposable local database. Populated upgrade rehearsal preserved counts and historical fingerprints across eight tables, including balances, payroll and audits, and rolled back completely.
- Shared package, API and frontend production builds passed; Prisma schema validation and Git whitespace checks passed.
- No production database connection, manual production migration or production test transaction was used. A current production recovery point remains to be supplied before release.
