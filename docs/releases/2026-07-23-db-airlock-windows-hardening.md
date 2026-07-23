# Windows DB Backup Airlock Hardening

**Date:** 2026-07-23  
**Source:** unique work preserved from stale PR #85

## Delivered

- Windows-safe `pg_dump` and `pg_restore` command resolution;
- shell-free manifest discovery;
- database-backup ledger compatibility when `backup_records.user_id` is required;
- filesystem `db_dump` checkpoint recognition in the migration airlock;
- command-local dotenv loading without rewriting the concurrently changed package manifest;
- `.backups/` repository hygiene and focused contract coverage.

## Preservation repair

Six unchanged implementation/test files were transplanted as exact reviewed blobs onto current `main`. `.gitignore` received only the `.backups/` addition. Instead of replacing current `package.json`, the directly invoked DB scripts now load `dotenv/config` themselves; existing migration and schema-verification scripts already do the same.

## Validation

Required: focused DB-airlock contract, typecheck, full tests, release contract, production build, Docker packaging, and disposable PostgreSQL migration checks.

## Proof ceiling

Repository and disposable-local validation do not prove Neon, Render, production backup storage, production credentials, or a successful production restore.
