# AxTask DB Backup Scripts

This directory will contain database-level backup and restore safety scripts.

## Planned Scripts

| Script | Purpose |
|---|---|
| `backup.mjs` | Create DB dump and manifest |
| `preflight-backup.mjs` | Required checkpoint before migration |
| `restore-test.mjs` | Restore latest backup to staging/temp DB |
| `hash-backup.mjs` | Verify backup hash |
| `list-backups.mjs` | List known backups and manifests |
| `prune-backups.mjs` | Retention pruning for old backups |

## Design Rule

The application may create backups, but protected backup deletion must require separate authority.
