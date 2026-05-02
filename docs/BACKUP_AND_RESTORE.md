# Backup and Restore

AxTask provides manual account backup and restore today. Automated backups are planned but not yet wired.

## Manual JSON Backup

1. Open the app and go to **Settings → Import/Export**.
2. Click **Download JSON backup**.
3. The file contains tasks, wallet snapshot, and badges.
4. In production, an email step-up code is required before download.

## Backup Ledger

Every backup attempt writes a row to `backup_records`:

- `pending` → backup is running
- `completed` → backup finished, `pathOrUrl` points to the file
- `failed` → backup errored, `errorMessage` explains why

The status endpoint returns the most recent `completedAt` as `lastServerBackupAt`.

## Dry-Run Restore

1. On the same **Import/Export** page, select your `.json` backup under **Full account backup (JSON)**.
2. Click **Dry run** to preview what would be inserted without changing data.
3. Review the counts and any warnings before proceeding.

## Real Restore Warning

- **Real import is destructive in the sense that it writes data.**
- Tasks are merged using fingerprint deduplication; duplicates are skipped, not overwritten.
- Wallet balances from the backup are **never** applied automatically (ledger-safe rule).
- Run a dry run first. Keep your original backup file until you confirm the restore looks correct.

## Local PostgreSQL Backup

For self-hosted deployments, back up the raw database:

```bash
pg_dump "$DATABASE_URL" > axtask-pg-backup-$(date +%F).sql
```

Store the SQL file outside the server. Restore with:

```bash
psql "$DATABASE_URL" < axtask-pg-backup-YYYY-MM-DD.sql
```

## Docker Volume Backup

If running with the provided `docker-compose.yml`:

```bash
docker run --rm \
  -v axtask_postgres_data:/data \
  -v $(pwd):/backup \
  alpine tar cvf /backup/postgres-backup.tar /data
```

## Automated Local Backup Scheduler (Opt-in)

Set the environment variable to activate:

```bash
BACKUP_SCHEDULER_ENABLED=true
BACKUP_SCHEDULER_INTERVAL_MS=86400000   # 24h default
BACKUP_SCHEDULER_BATCH_SIZE=100         # users per chunk (default 100)
BACKUP_LOCAL_DIR=./backups              # optional output directory
```

The scheduler iterates over all users in configurable chunks, exports a JSON bundle per user, and writes a `backup_records` ledger entry. One user failing does not abort the batch or the chunk. A small delay is inserted between chunks to avoid hammering the database.

Users can opt in or out of automatic backups individually via `PATCH /api/account/backup/preferences`:

```json
{
  "autoBackupEnabled": false,
  "preferredTarget": "local"
}
```

Default is `autoBackupEnabled: true` and `preferredTarget: "default"` (falls back to server env configuration).

### S3-Compatible Target (Optional)

Instead of writing to local disk, set S3-compatible environment variables:

```bash
BACKUP_S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
BACKUP_S3_BUCKET=my-axtask-backups
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY_ID=AKIA...
BACKUP_S3_SECRET_ACCESS_KEY=...
BACKUP_S3_PREFIX=backups/          # optional key prefix
```

Works with AWS S3, MinIO, Wasabi, DigitalOcean Spaces, and any other service that accepts AWS Signature Version 4 PUT requests. Users can override the server default target by setting `preferredTarget: "s3"` or `preferredTarget: "local"` in their preferences.

### Admin Config Endpoint

`GET /api/admin/backup/config` (admin auth required)

Returns the active server-wide backup configuration:

```json
{
  "automaticBackupsConfigured": true,
  "intervalMs": 86400000,
  "batchSize": 100,
  "target": "s3",
  "s3Bucket": "my-axtask-backups",
  "localDir": null
}
```

### Admin Health Endpoint

`GET /api/admin/backup/health` (admin auth required)

Returns `200` if healthy or `503` if the scheduler is enabled but no recent successful backup exists or the target is not writable:

```json
{
  "schedulerEnabled": true,
  "latestBackupRecord": {
    "status": "completed",
    "createdAt": "2026-05-02T14:30:00.000Z",
    "completedAt": "2026-05-02T14:30:05.000Z",
    "type": "s3",
    "hasError": false
  },
  "envTarget": "s3",
  "writable": true
}
```

The `writable` field is now a live write-test: the endpoint attempts to write a small probe file to the configured target and reports whether it succeeded.

### Admin Verify Endpoint

`POST /api/admin/backup/verify` (admin auth required)

Re-reads the most recent completed backup from its stored location, recomputes the SHA-256 hash, and compares it with the hash recorded at backup time:

```json
{
  "verified": true,
  "recordId": "...",
  "sha256": "a1b2c3..."
}
```

Returns `409` if the hash does not match or the file cannot be read, indicating the backup may be corrupted or truncated.

## What Is Not Yet Automated

- No Windows Task Scheduler integration (use the Node.js scheduler or cron).
- No CLI-authenticated backup (the `backup:local` script is informational only).

## Future Roadmap

1. **Migration Airlock** — safe migration commands that refuse to run without a verified backup.

See also the repository-wide [**Reliability Roadmap**](../README.md#reliability-roadmap).

## Script

```bash
npm run backup:local
```

This prints current options and exits cleanly. It does not perform a backup because CLI authentication is not yet implemented.
