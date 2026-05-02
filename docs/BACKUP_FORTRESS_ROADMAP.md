# AxTask Backup Fortress Roadmap

## Purpose

AxTask must survive database loss, bad migrations, accidental deletion, unsafe automation, compromised credentials, and failed restores.

This roadmap defines the recovery architecture for AxTask at three levels:

1. Database-level disaster recovery
2. App-level user/account recovery
3. Destructive-action guardrails

## Recovery Layers

| Layer | Purpose | Example |
|---|---|---|
| DB backup | Recover whole AxTask database | pg_dump, provider snapshot, PITR |
| App backup | Recover user/account data | JSON account export/import |
| Soft delete | Recover normal user mistakes | Trash/restore |
| Backup ledger | Prove backups exist and were verified | backup_records |
| Restore drill | Prove backups actually restore | staging restore test |
| Agent safety | Prevent automation from destroying prod | production command blocker |

## Priority Order

1. DB backup airlock
2. Restore drill
3. Backup storage separation
4. Provider snapshot/PITR documentation
5. Task soft delete
6. Backup ledger
7. JSON backup v2
8. Destructive-action guard
9. Immutable/offsite backup target
10. AI/agent production safety

## Non-Negotiable Principles

### 1. A backup that has not been restored is not trusted

Backups must be periodically restored into staging or a disposable database.

### 2. App runtime credentials must not be able to delete protected backups

The app may write backups. It must not control the entire backup lifecycle.

### 3. Migrations require a backup checkpoint

Production-like migrations must fail closed if preflight backup fails.

### 4. Deletes are reversible by default

Normal app deletes should become soft deletes. Hard purge must be delayed, logged, and guarded.

### 5. Wallet and economic ledgers are not blindly restored

Wallet balances may be exported as snapshots, but balances should only move through ledger-safe application logic.

### 6. AI agents do not get production destructive authority

No production DATABASE_URL, backup-delete credentials, purge commands, or migration authority for agent workflows.

## Sprint Map

### Sprint 1: DB Backup Airlock

Build:

- `scripts/db/backup.mjs`
- `scripts/db/preflight-backup.mjs`
- `scripts/db/restore-test.mjs`
- backup manifest JSON
- `db:backup`
- `db:migrate:safe`
- `db:restore:test`

Done when:

- DB backup creates `.dump` and `.manifest.json`
- backup hash verifies
- safe migration refuses to run if backup fails
- restore test can restore latest backup to staging/temp DB

### Sprint 2: Restore Drill

Build:

- restore latest backup into staging/temp DB
- schema verification
- table count sanity check
- smoke API check
- restore-tested marker in manifest/ledger

Done when:

- latest backup can be restored without manual guesswork

### Sprint 3: Task Soft Delete

Build:

- `deletedAt`
- `deletedBy`
- `deleteReason`
- `purgeAfter`
- `restoreCount`
- Trash UI
- restore route
- retention-gated purge route

Done when:

- create task -> delete -> restore -> purge after retention works

### Sprint 4: Backup Ledger

Build:

- `backup_records`
- `restore_records`
- `backup_record_events`

Track:

- backup kind
- scope
- storage target
- filename
- byte size
- SHA-256 hash
- schema version
- app version
- table counts
- status
- created time
- verified time
- restore-tested time
- expiration time

### Sprint 5: JSON Backup v2

Expand account backup to include:

- preferences
- skill progress
- patterns
- reminders
- study decks/cards
- attachment metadata

Do not directly restore wallet balances.

### Sprint 6: Immutable Backup Target

Build:

- local backup target
- remote object storage target
- write-only app credential model
- admin-only restore/delete model

### Sprint 7: Agent Safety

Build:

- production destructive command blocker
- AI agent safety doctrine
- migration PR checklist
- restore-drill requirement for migration PRs
