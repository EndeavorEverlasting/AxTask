# Windows DB Backup Airlock Hardening

**Date:** 2026-07-23  
**Source:** unique work preserved from stale PR #85

## Delivered

- Windows-safe `pg_dump` and `pg_restore` command resolution;
- shell-free manifest discovery;
- database-backup ledger compatibility when `backup_records.user_id` is required;
- target-bound filesystem `db_dump` checkpoint recognition in the migration airlock;
- binary-safe custom-format dump verification;
- command-local dotenv loading without rewriting the concurrently changed package manifest;
- `.backups/` repository hygiene and focused contract coverage.

## Preservation repair

Six unchanged implementation/test files were transplanted as exact reviewed blobs onto current `main`. `.gitignore` received only the `.backups/` addition. Instead of replacing current `package.json`, the directly invoked DB scripts load `dotenv/config` themselves; existing migration and schema-verification commands retain their current invocation contracts.

## Rollout

1. Merge only after the focused DB-airlock contract and full current-head CI pass.
2. Exercise `db:backup`, `db:backup:preflight`, and `db:migrate:safe` against a disposable local PostgreSQL database first.
3. Confirm the generated manifest contains `backupKind=db_dump`, `databaseFingerprint`, SHA-256, and the expected dump path.
4. Exercise `db:restore:test` only with a disposable `RESTORE_DATABASE_URL` that differs from `DATABASE_URL`.
5. Production or Neon use remains a separate authorized operator gate with a fresh target-bound backup.

## Rollback

Revert the DB command, pg-tool helper, migration-airlock, backup verifier, environment documentation, ignore rule, test, and release record together. Existing dump files and manifests are not deleted automatically. Do not weaken target matching or binary verification merely to make an old checkpoint pass; create a fresh current-target backup instead.

## Validation

Required: focused DB-airlock contract, typecheck, full tests, release contract, production build, Docker packaging, client and API performance gates, and disposable PostgreSQL migration/idempotency checks.

## Proof ceiling

Repository and disposable-local validation do not prove Neon, Render, production backup storage, production credentials, a production restore, or application of the hardened workflow in a live environment.
