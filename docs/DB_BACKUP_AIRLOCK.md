# Database Backup Airlock

## Goal

No production-like database migration, push, prune, or destructive database operation should run unless AxTask first creates and verifies a backup checkpoint.

## Required Commands

```json
{
  "db:backup": "node scripts/db/backup.mjs",
  "db:backup:preflight": "node scripts/db/preflight-backup.mjs",
  "db:restore:test": "node scripts/db/restore-test.mjs",
  "db:migrate:safe": "node scripts/db/preflight-backup.mjs && node -r dotenv/config scripts/apply-migrations.mjs && node scripts/migration/verify-schema.mjs",
  "db:push:safe": "node scripts/db/preflight-backup.mjs && node scripts/drizzle-push.mjs && node scripts/migration/verify-schema.mjs"
}
```

## Backup Manifest

Each DB backup must produce:

```json
{
  "app": "AxTask",
  "backupKind": "pre_migration",
  "createdAt": "ISO_TIMESTAMP",
  "databaseHost": "masked-host",
  "databaseName": "masked-db",
  "gitCommit": "commit-sha",
  "dumpFile": "backup.dump",
  "sha256": "hash",
  "byteSize": 0,
  "retentionClass": "daily",
  "restoreTestedAt": null
}
```

## Fail-Closed Rules

The safe migration command must stop if:

- `DATABASE_URL` is missing
- backup command fails
- backup hash cannot be computed
- manifest cannot be written
- environment looks production-like and no backup target exists
- schema verification fails after migration

## Recovery Standard

A database backup is only trusted after restore testing.

Minimum restore test:

1. Restore dump to staging/temp DB
2. Run schema verification
3. Compare table counts
4. Run smoke API checks
5. Mark backup as restore-tested
