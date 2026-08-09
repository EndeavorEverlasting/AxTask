# Account Evidence Preservation and Provider Portability

## Purpose

AxTask's ordinary Backup Center export is a restore-oriented semantic bundle. It is intentionally smaller than the database and does not preserve the full audit/event history. During a storage incident, database cleanup must not destroy account-linked records before a portable preservation artifact exists.

This workflow creates a **read-only account evidence bundle** before destructive retention or reclaim work.

It is a technical preservation mechanism, not a determination of legal admissibility, chain-of-custody sufficiency, or legal-hold obligations. If records are subject to a formal legal hold, follow the applicable legal process in addition to this technical export.

## Export scope and truth boundary

`scripts/db/export-account-evidence.mjs` opens one PostgreSQL transaction as:

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
```

Within that snapshot it:

- resolves exactly one account by user ID or email;
- discovers concrete `public` base tables;
- exports rows linked by `user_id`, any `*_user_id` role column, or known unsuffixed user-role columns;
- exports rows linked by `task_id` or any `*_task_id` column;
- follows explicit shared shopping-list, DM-conversation, task-reminder, community-post, invoice, and attachment-asset relationships;
- exports meaningful account-linked `security_events` row-for-row;
- lists **every discovered table that produced no artifact** in the manifest with a reason;
- records the linking path for every exported table;
- hashes every JSONL artifact and the manifest;
- records source Git commit and a non-secret database target fingerprint.

This is an **account-scoped preservation bundle**, not an exhaustive database dump. Review `excludedTables` and each artifact's `linkingPaths` for the preservation purpose at hand.

### Shared / third-party scope

Role/action columns such as `actor_user_id`, `sender_user_id`, `recipient_user_id`, `created_by_user_id`, `purchased_by_user_id`, and `deleted_by`, plus shared-list/conversation/post relationships, can select records authored by or concerning another user. Treat the resulting bundle as private evidence. The manifest records this scope explicitly.

### Incomplete-export sentinel

The exporter writes `EXPORT_INCOMPLETE` as soon as the output directory is created. It fsyncs evidence files and directory metadata and removes the sentinel only after the read-only snapshot commits and the hashed manifest has been durably written.

**Never remove `EXPORT_INCOMPLETE` manually.** A directory containing it is not a valid preservation bundle.

## Known credential-bearing exclusions and redactions

The portable account bundle explicitly excludes these known ephemeral/secret-bearing tables:

- `session`
- `password_reset_tokens`
- `mfa_challenges`
- `user_push_subscriptions`

The account row explicitly redacts password/TOTP/provider-auth secret fields, and `idempotency_keys.key` is redacted.

This is an explicit denylist, **not a claim that every future credential-bearing field is automatically recognized**. Review the manifest and current schema before relying on a new schema version. The raw database dump is a separate disaster-recovery artifact and can contain secrets, so protect it accordingly.

## High-volume `api_request` policy

The August 2026 incident showed that `security_events` can be overwhelmingly dominated by `api_request` telemetry. Exporting that class row-for-row by default could reproduce a tens-of-gigabytes storage problem on the operator machine.

Default:

```text
--api-request-mode=summary
```

Summary mode exports non-`api_request` security events row-for-row and preserves the account-linked `api_request` class as:

- row count;
- first/last timestamp;
- UTC daily row counts;
- first/last tamper-evident chain anchors (`prev_hash` / `event_hash`).

No source row is deleted. If individual request rows are required for the preservation purpose, explicitly use `--api-request-mode=all` and ensure the destination has sufficient protected capacity. `--api-request-mode=exclude` is also available, but the manifest records that explicit choice.

## Local / disposable use

With `DATABASE_URL` pointed at loopback PostgreSQL:

```bash
ACCOUNT_EMAIL='user@example.com'
node scripts/db/export-account-evidence.mjs --email="$ACCOUNT_EMAIL" --json
```

or:

```bash
ACCOUNT_USER_ID='00000000-0000-0000-0000-000000000000'
node scripts/db/export-account-evidence.mjs --user-id="$ACCOUNT_USER_ID" --json
```

The local default destination is `.backups/evidence/`, which is repository-ignored. Git-ignore is **not** a confidentiality control.

## Production read-only export

Keep the application service suspended during incident recovery. Load `DATABASE_URL` through the normal secret path.

A non-loopback export is rejected unless:

- `--prod` is affirmative;
- `--force-production` is affirmative;
- `--output-dir` is an explicit **absolute** path.

The operator must choose an encrypted/protected destination they control. For example:

```bash
ACCOUNT_EMAIL='user@example.com'
EVIDENCE_DIR='/mnt/encrypted/axtask-evidence'
node scripts/db/export-account-evidence.mjs \
  --email="$ACCOUNT_EMAIL" \
  --prod \
  --force-production \
  --output-dir="$EVIDENCE_DIR" \
  --api-request-mode=summary \
  --json
```

For full high-volume telemetry rows:

```bash
ACCOUNT_EMAIL='user@example.com'
EVIDENCE_DIR='/mnt/encrypted/axtask-evidence'
node scripts/db/export-account-evidence.mjs \
  --email="$ACCOUNT_EMAIL" \
  --prod \
  --force-production \
  --output-dir="$EVIDENCE_DIR" \
  --api-request-mode=all \
  --batch-size=1000 \
  --json
```

These flags authorize a **read-only export only**. They do not authorize deletion, migrations, provider changes, or Render resume.

## Verification

1. Wait for the exporter to exit successfully with status 0.
2. Confirm `EXPORT_INCOMPLETE` is absent. **Never delete the sentinel yourself.** If it exists, discard or quarantine that partial directory and rerun the exporter to a new directory.
3. Verify the manifest hash.

On a Unix-like shell, from the completed export directory:

```bash
sha256sum -c manifest.sha256
```

On PowerShell, use `Get-FileHash -Algorithm SHA256` for `manifest.json` and the individual files, comparing them with `manifest.sha256` and `manifest.json`.

4. Verify every artifact SHA-256 recorded in `manifest.json`.
5. Verify the manifest identifies the expected account, database fingerprint, linking policy, `api_request` policy, and excluded-table set.

## Attachment object bytes

The account evidence bundle preserves database rows and attachment metadata/storage keys, but **does not copy attachment object bytes**. The manifest records `attachmentObjectBytesIncluded: false`.

If attachment files are part of the required record set, separately replicate those object bytes to protected storage, hash them, and retain a copy manifest that maps each object/storage key to its SHA-256. That object-copy proof is required before destructive cleanup when attachments are in scope.

## Two-copy preservation floor

Before source deletion, preserve **two independently controlled copies** of the completed account evidence bundle. A practical pattern is:

1. encrypted local/offline storage;
2. an independent object-storage or backup-provider copy.

Verify hashes after each copy. A copy that has not been verified does not satisfy this gate.

AxTask's existing backup subsystem supports S3-compatible targets for restore-oriented account backups. The evidence exporter intentionally emits provider-neutral filesystem artifacts instead of coupling preservation to one cloud SDK.

## Raw database backup remains separate

Before destructive production cleanup, also run:

```bash
npm run db:backup:preflight
npm run db:backup
```

Then prove the raw backup can restore into disposable PostgreSQL using the repository recovery workflow.

The custom-format `pg_dump` is the database-level rollback artifact. The account evidence bundle is the account/audit-focused portable artifact. **Neither substitutes for the other.**

## Provider independence model

The target architecture is deliberately provider-replaceable:

- **PostgreSQL:** hot application state behind `DATABASE_URL`;
- **portable account evidence:** JSONL + SHA-256 manifest outside the database provider;
- **raw recovery backup:** PostgreSQL custom-format dump outside the database provider;
- **attachment/object assets:** storage keys in the DB plus independently replicated bytes when those objects matter;
- **high-volume telemetry:** only the useful hot window in Postgres after preservation, with older telemetry archived or summarized under an explicit retention policy.

Moving from one serverless PostgreSQL vendor to another does not itself create provider independence. Independence comes from tested exports, independently stored backups, and a restore path that does not depend on the original provider remaining available.

## Completion gate before cleanup

Do not advance to destructive logical cleanup until all applicable items are recorded:

- exporter exited successfully;
- `EXPORT_INCOMPLETE` is absent without manual removal;
- `manifest.sha256` verifies;
- every per-file hash verifies;
- expected account/database fingerprint and account-link policy are reviewed;
- meaningful security-event files are present;
- the `api_request` preservation policy is explicit;
- **two independently controlled, hash-verified account-evidence copies exist**;
- current raw DB backup exists;
- raw DB backup passed disposable restore verification;
- when attachments are in scope, attachment object bytes were separately copied and hash-verified against an object-copy manifest.

Only after these gates should the operator evaluate targeted `api_request` cleanup in `docs/DB_RECOVERY_RUNBOOK.md`.
