# Account Backup Round-Trip Certification

**Date:** 2026-07-31  
**Source:** P01 account backup cleanup and disposable-runtime certification

## Diagnosis

Backup Center downloads are semantic account bundles containing tasks, a wallet snapshot, and badge identifiers. The account import route previously treated any user bundle containing `tasks` as a full migration export. That classification was too broad: semantic Backup Center bundles do not carry the migration importer’s `users` table, primary keys, or foreign-key identity graph. A dry run could therefore appear acceptable while a wet import entered the wrong importer.

The stale PR #104 backup runner also proved dump-manifest mechanics rather than the user-facing account export/import contract and allowed proof to pass when restore was skipped.

## Delivered

- route classification now distinguishes migration user exports by a non-empty `users` table and schema-version metadata;
- Backup Center semantic bundles remain on `runAccountImport`, including ownership verification, fingerprint dedupe, and ledger-safe wallet behavior;
- focused unit coverage prevents semantic bundles from regressing into the migration importer;
- disposable PostgreSQL integration now proves:
  - source account seeding;
  - account export;
  - dry-run target non-mutation;
  - wet task and badge restoration;
  - selected task field parity;
  - source-account non-mutation;
  - repeated-import fingerprint suppression;
  - explicit wallet non-restoration warning;
- `scripts/db/run-local-account-backup-cert.mjs` fails closed outside loopback PostgreSQL and emits machine-readable and human-readable proof under ignored `.ai/runs/`;
- CI executes that certification after the normal greenfield schema bootstrap;
- the capability, trigger, workflow, artifact, schema, and validator contracts are registered in the harness.

## Terminal certification states

- `PASS_ACCOUNT_ROUNDTRIP`
- `FAIL_SCHEMA_BOOTSTRAP`
- `FAIL_MIGRATION`
- `FAIL_DATA_PARITY`
- `BLOCKED_NO_DISPOSABLE_POSTGRES`

## Operator command

With a disposable local PostgreSQL database in `DATABASE_URL`:

`node scripts/db/run-local-account-backup-cert.mjs`

The runner rejects non-loopback database hosts and production host markers and never prints the database connection string.

## Rollout

No deployment, Neon mutation, Render change, production account access, or production backup target is required. Merge only after the exact PR head passes repository CI including the new account backup certification step.

## Rollback

Revert the account-bundle classifier, its unit contract, the round-trip integration case, certification runner, CI step, and harness registrations together. Do not restore the previous broad `tasks`-based migration-bundle classifier.

## Proof ceiling

The certification proves the covered Backup Center account round trip against disposable loopback PostgreSQL. It does not prove Neon recovery, Render deployment, real-user disaster recovery, backup-target durability, recovery time objectives, or future schema versions outside the covered contract.
