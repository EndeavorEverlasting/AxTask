authorityRef: axtask.agent-authority.v1

# Account Backup Round-Trip Certification

id: axtask.account-backup-roundtrip-certification.v1

## Purpose

Prove the Backup Center JSON export/import contract against disposable loopback PostgreSQL before deployment. The certification must distinguish the semantic Backup Center bundle from migration-table exports and must fail closed for production-like database targets.

## Trigger

`account-backup-certification-requested` — account backup/import behavior changes or a deployment candidate needs current recovery proof.

## Inputs

- current repository checkout;
- `DATABASE_URL` pointing only to loopback PostgreSQL with an AxTask/test/CI/dev database name;
- current schema/migrations, or no `--schema-ready` flag so the runner prepares them itself.

## Steps

1. **Gate the database target**
   - Reject missing or malformed `DATABASE_URL`.
   - Reject non-loopback PostgreSQL hosts.
   - Reject `RENDER=true` and `AXTASK_PRODUCTION=true`.
   - Never print the connection string.

2. **Prepare disposable schema**
   - Unless `--schema-ready` is supplied, run the greenfield Drizzle bootstrap, numbered migrations, and idempotent Drizzle push.

3. **Classify backup bundle type**
   - Backup Center semantic bundles contain `tasks`, `walletSnapshot`, and `badges` and must route through `runAccountImport`.
   - Migration user exports are recognized only when they carry a non-empty `users` table plus user-export metadata.

4. **Run account round trip**
   - Create synthetic source and target users in disposable PostgreSQL.
   - Seed the source through the account importer.
   - Export the source through `buildUserExportBundle`.
   - Dry-run import into the target and prove no mutation.
   - Perform the wet import and prove task/badge parity.
   - Prove the source account is unchanged.
   - Re-import and prove fingerprint duplicate suppression.
   - Preserve the wallet non-restoration warning so coin balances remain ledger-safe.

5. **Emit evidence**
   - `.ai/runs/<run-id>/account-backup-certification.json`
   - `.ai/runs/<run-id>/account-backup-certification.md`
   - JSON must match `.ai/schemas/account-backup-certification-result.schema.json`.

## Terminal states

- `PASS_ACCOUNT_ROUNDTRIP`
- `FAIL_SCHEMA_BOOTSTRAP`
- `FAIL_MIGRATION`
- `FAIL_DATA_PARITY`
- `BLOCKED_NO_DISPOSABLE_POSTGRES`

## Command

`node scripts/db/run-local-account-backup-cert.mjs`

When the caller already prepared the disposable schema exactly as CI does, use:

`node scripts/db/run-local-account-backup-cert.mjs --schema-ready`

## Proof ceiling

Disposable PostgreSQL runtime proof only. This workflow does not touch or certify Neon, Render, production users, production backup targets, disaster-recovery timing, or future schema versions not covered by the tests.
