# Backup and Restore

AxTask provides manual account backup and restore today. Automated backups are planned but not yet wired.

## Manual JSON Backup

1. Open the app and go to **Settings → Import/Export**.
2. Click **Download JSON backup**.
3. The file contains tasks, wallet snapshot, and badges.
4. In production, an email step-up code is required before download.

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

## What Is Not Yet Automated

- No cron-based or scheduled automatic JSON export.
- No Windows Task Scheduler integration.
- No cloud object storage uploads (S3, GCS, etc.).
- No CLI-authenticated backup (the `backup:local` script is informational only).

## Future Roadmap

1. **Backup Ledger** — durable `backup_records` and `restore_records` table tracking.
2. **Scheduler Foundation** — cron / Task Scheduler / Docker volume hooks built on the local script foundation.
3. **Backup Targets** — pluggable write-only targets (local disk, S3-compatible, rsync).
4. **Migration Airlock** — safe migration commands that refuse to run without a verified backup.

See also the repository-wide [**Reliability Roadmap**](../README.md#reliability-roadmap).

## Script

```bash
npm run backup:local
```

This prints current options and exits cleanly. It does not perform a backup because CLI authentication is not yet implemented.
