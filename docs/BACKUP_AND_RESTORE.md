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
BACKUP_LOCAL_DIR=./backups              # optional output directory
```

The scheduler iterates over all users, exports a JSON bundle per user, and writes a `backup_records` ledger entry. One user failing does not abort the batch.

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

Works with AWS S3, MinIO, Wasabi, DigitalOcean Spaces, and any other service that accepts AWS Signature Version 4 PUT requests.

### Admin Config Endpoint

`GET /api/admin/backup/config` (admin auth required)

Returns the active server-wide backup configuration:

```json
{
  "automaticBackupsConfigured": true,
  "intervalMs": 86400000,
  "target": "s3",
  "s3Bucket": "my-axtask-backups",
  "localDir": null
}
```

## What Is Not Yet Automated

- No Windows Task Scheduler integration (use the Node.js scheduler or cron).
- No cloud object storage uploads (S3, GCS, etc.).
- No CLI-authenticated backup (the `backup:local` script is informational only).

## Future Roadmap

1. **Backup Targets** — pluggable write-only targets (local disk, S3-compatible, rsync).
2. **Migration Airlock** — safe migration commands that refuse to run without a verified backup.

See also the repository-wide [**Reliability Roadmap**](../README.md#reliability-roadmap).

## Script

```bash
npm run backup:local
```

This prints current options and exits cleanly. It does not perform a backup because CLI authentication is not yet implemented.
