# Account Evidence Preservation and Provider Portability

## Purpose

AxTask's ordinary Backup Center export is a restore-oriented semantic bundle. It is intentionally smaller than the database and does not preserve the full audit/event history. During a storage incident, that distinction matters: database cleanup must not destroy account-linked records before a preservation artifact exists.

This workflow creates a **read-only account evidence bundle** under `.backups/evidence/` before destructive retention or reclaim work.

It is a technical preservation mechanism, not a determination of legal admissibility, chain-of-custody sufficiency, or legal-hold obligations. If records are subject to a formal legal hold, follow the applicable legal process in addition to this technical export.

## What the exporter preserves

`scripts/db/export-account-evidence.mjs` opens one PostgreSQL transaction as:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
```

Within that single snapshot it:

- resolves exactly one account by `--user-id` or `--email`;
- discovers concrete public base tables and exports rows directly linked through `user_id`, `actor_user_id`, `target_user_id`, or `deleted_by`;
- includes task-, invoice-, and attachment-linked rows where the table carries the corresponding foreign key;
- exports meaningful account-linked `security_events` row-for-row;
- hashes every JSONL artifact;
- writes a manifest containing counts, first/last timestamps where available, per-file SHA-256 values, source Git commit, and a non-secret database target fingerprint;
- writes `manifest.sha256` so the manifest itself can be verified after it leaves the database provider.

### Incomplete-export sentinel

As soon as an export directory is created, the exporter writes:

```text
EXPORT_INCOMPLETE
```

That file remains present on any database, filesystem, hashing, or manifest failure. It is removed only after the read-only database snapshot commits successfully and the hashed manifest has been written.

**Never treat a directory containing `EXPORT_INCOMPLETE` as a valid preservation bundle.** A complete bundle must have the sentinel absent and `manifest.sha256` must verify.

### Credential-bearing data is not copied into the portable account bundle

The following ephemeral/secret-bearing tables are excluded by default:

- `session`
- `password_reset_tokens`
- `mfa_challenges`
- `user_push_subscriptions`

The account row also omits password/TOTP/provider-auth secret fields. The manifest records excluded tables and redacted columns. A raw database dump is the separate disaster-recovery artifact when complete physical database preservation is required.

## `api_request` policy

The August 2026 incident showed that `security_events` can be overwhelmingly dominated by `api_request` telemetry. Exporting that class row-for-row by default could reproduce a tens-of-gigabytes storage problem on the operator machine.

The default is therefore:

```text
--api-request-mode=summary
```

That mode exports non-`api_request` security events row-for-row and preserves the account-linked `api_request` class as:

- row count;
- first/last timestamp;
- first/last tamper-evident chain anchors (`prev_hash` / `event_hash`);
- daily row counts.

No `api_request` row is deleted by the exporter. The source database is read-only throughout the export.

If individual request rows are themselves required for the preservation purpose, explicitly select:

```text
--api-request-mode=all
```

`--api-request-mode=exclude` is available only when an operator intentionally wants no `api_request` content; the manifest records that policy.

## Local/disposable use

With `DATABASE_URL` pointed at loopback PostgreSQL:

```bash
node scripts/db/export-account-evidence.mjs --email=user@example.com --json
```

or:

```bash
node scripts/db/export-account-evidence.mjs --user-id=<user-id> --json
```

The default destination is:

```text
.backups/evidence/account-evidence-<timestamp>-<account-prefix>/
```

`.backups/` is repository-ignored because these artifacts may contain private account data.

## Production read-only export

Keep the application service suspended during incident recovery. Load `DATABASE_URL` through the normal secret path; never paste it into a tracked file or shell history if your environment can avoid that.

A non-loopback database is rejected unless both production-read flags are supplied:

```bash
node scripts/db/export-account-evidence.mjs \
  --email=user@example.com \
  --prod \
  --force-production \
  --api-request-mode=summary \
  --json
```

Those flags authorize a **read-only export**, not deletion, migrations, provider changes, or Render resume.

For the full high-volume telemetry class:

```bash
node scripts/db/export-account-evidence.mjs \
  --email=user@example.com \
  --prod \
  --force-production \
  --api-request-mode=all \
  --batch-size=1000 \
  --json
```

Use `--output-dir=<path>` when the evidence should be written directly to a mounted encrypted disk or another operator-owned destination.

## Verification

Before hashing anything, confirm the directory does **not** contain `EXPORT_INCOMPLETE`.

From the export directory:

```bash
sha256sum -c manifest.sha256
```

Then verify each file hash against `manifest.json`. On PowerShell, use `Get-FileHash -Algorithm SHA256` for the individual files and manifest.

Preserve at least two independently controlled copies before deleting source records. A practical pattern is:

1. encrypted local/offline copy;
2. a second independent object-storage or backup-provider copy.

AxTask's existing backup subsystem already supports S3-compatible targets for restore-oriented account backups. This evidence exporter intentionally stops at producing a portable filesystem artifact so the preservation copy is not coupled to one particular cloud provider or SDK.

## Raw database backup remains separate

Before destructive production cleanup, also run the existing database airlock backup:

```bash
npm run db:backup:preflight
npm run db:backup
```

The custom-format `pg_dump` is the database-level rollback artifact. The account evidence bundle is the human/audit-focused portable artifact. Neither substitutes for the other.

## Provider independence model

The target architecture is intentionally provider-replaceable:

- **PostgreSQL:** hot application state; `DATABASE_URL` remains the abstraction boundary.
- **Portable account evidence:** JSONL + SHA-256 manifest outside the database provider.
- **Raw recovery backup:** PostgreSQL custom-format dump outside the database provider.
- **Attachments/object assets:** preserve their storage keys and separately replicate the object bytes when those objects are part of the required record set.
- **High-volume telemetry:** keep only the operationally useful hot window in Postgres after preservation; archive or summarize older telemetry according to explicit retention policy.

Moving from one serverless PostgreSQL vendor to another does not by itself create provider independence. Independence comes from tested exports, independently stored backups, and a restore path that does not depend on the original provider remaining available.

## Completion evidence before cleanup

Do not advance database recovery to destructive logical cleanup until all applicable items are recorded:

- account evidence export directory exists;
- `EXPORT_INCOMPLETE` is absent;
- `manifest.sha256` verifies;
- the manifest identifies the expected account and database fingerprint;
- meaningful security-event files are present;
- the `api_request` policy is explicitly recorded;
- current raw DB backup exists;
- raw DB backup has passed the repository's disposable restore verification;
- at least one preservation copy exists outside the database provider.

Only after these gates should the operator evaluate targeted `api_request` cleanup from `docs/DB_RECOVERY_RUNBOOK.md`.
