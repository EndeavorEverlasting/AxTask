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

### Protected Backup Criteria

A backup is considered **protected** when any of the following metadata fields are set:

| Field | Type | Protection Trigger |
|---|---|---|
| `protected` | `boolean` | `true` |
| `protected_until` | `timestamp` | Value is in the future (UTC) |
| `protection_reason` | `enum` | Any value (e.g., `production`, `legal_hold`, `critical`) |
| `protection_level` | `enum` | Any value (e.g., `high`, `critical`) |

A protected backup **cannot** be deleted through the standard deletion workflow (`deleteBackup` / `delete_backup`) unless `authorizeProtectedDeletion()` returns `true`.

### Authorization Requirements

`authorizeProtectedDeletion(record)` must verify **at least one** of the following before allowing deletion:

1. **IAM Role** — caller holds a dedicated `backup:delete-protected` role.
2. **Approval Token** — a signed token from a second-party approval service (e.g., security-ops) is present and valid.
3. **MFA Confirmation** — the caller has completed a fresh MFA step-up challenge scoped to this deletion.

### Audit Logging

When a protected backup is deleted, the system must log:

- `approverId`: the user or service principal that authorized the deletion.
- `method`: which authorization path was used (`iam`, `approval_token`, `mfa`).
- `timestamp`: exact UTC time of authorization and deletion.

These logs are written to the append-only audit stream and are never pruned by retention jobs.
