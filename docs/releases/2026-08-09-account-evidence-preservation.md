# 2026-08-09 — Account Evidence Preservation and Provider Portability

## Objective

Prevent database-capacity recovery from deleting account-linked records before a portable, independently verifiable preservation artifact exists.

## Incident context

The production database was measured at approximately 36.20 GB with approximately 36.19 GB concentrated in `security_events`. Render remains suspended. No production database mutation or Render resume is part of this release.

The existing Backup Center account export is restore-oriented and intentionally smaller than the database. The migration-style user export also does not include `security_events`. That left a preservation gap before targeted telemetry cleanup.

## Delivered

- `scripts/db/export-account-evidence.mjs`
  - PostgreSQL `REPEATABLE READ READ ONLY` snapshot with UTC session policy;
  - exactly one account selected by user ID or email;
  - public base-table-only discovery;
  - direct `user_id` / `*_user_id` role links and `task_id` / `*_task_id` links;
  - explicit shopping-list, DM-conversation, reminder, community-post, invoice, and attachment descendant resolvers;
  - every discovered non-exported table recorded with a reason;
  - per-artifact linking paths and explicit shared/third-party scope;
  - bounded cursor streaming to JSONL rather than in-memory accumulation;
  - non-loopback reads require affirmative `--prod`, affirmative `--force-production`, and an explicit absolute protected `--output-dir`;
  - no database mutation path and no `DATABASE_URL` logging;
  - known ephemeral/secret-bearing tables excluded and sensitive account columns redacted;
  - per-file SHA-256 plus `manifest.json` and `manifest.sha256`;
  - evidence files and directory metadata fsynced before `EXPORT_INCOMPLETE` is removed;
  - non-secret database target fingerprint and source Git commit in the manifest;
  - attachment object bytes explicitly reported as not included.
- High-volume `api_request` policy:
  - default `summary` mode exports meaningful security events row-for-row;
  - preserves `api_request` count, time range, stable UTC daily counts, and first/last hash-chain anchors;
  - explicit `all` mode is available when individual telemetry rows must be preserved and sufficient protected external storage is available;
  - explicit `exclude` mode is recorded rather than silent.
- `docs/ACCOUNT_EVIDENCE_PRESERVATION.md`
  - safe production command examples using variables rather than shell redirection placeholders;
  - successful-exit/sentinel/hash verification order;
  - two independently controlled verified copies required before cleanup;
  - raw DB dump versus portable account artifact distinction;
  - provider-independence model;
  - separate attachment-object copy/hash requirement when attachment bytes are in scope.
- `docs/DB_RECOVERY_RUNBOOK.md`
  - adds mandatory R1.5 account-evidence preservation before R4 destructive cleanup;
  - requires R1.5 evidence, two verified account-evidence copies, applicable attachment-object evidence, and R3 raw backup/restore proof before deletion.
- `tests/deploy/14-account-evidence/account-evidence.contract.test.ts`
  - collected by the existing deploy Vitest project;
  - Node syntax, read-only transaction, base-table discovery, account-link coverage, explicit skipped-table inventory, production-intent/destination, UTC summary, fsync/sentinel, redaction, and hashing contracts.
- `server/account-evidence-export.integration.test.ts`
  - loopback/disposable PostgreSQL only;
  - seeds one account, a task-linked community row, meaningful security events, and historical `api_request` telemetry;
  - restores the production containment trigger before exporter execution;
  - runs the real CLI;
  - verifies sentinel removal, manifest and per-file hashes, secret redaction, indirect task-link preservation, meaningful-event preservation, `api_request` summary anchors, skipped-table inventory, and before/after source row-count equality.
- `scripts/db/run-local-account-backup-cert.mjs`
  - runs the evidence-export integration test after schema bootstrap/migrations as part of the existing disposable account-backup certification lane.
- `package.json`
  - declares the already-locked `pg@^8.20.0` runtime dependency explicitly;
  - adds `db:evidence-export` and `test:deploy:account-evidence` scripts;
  - includes the new deploy contract in `npm run test:deploy`.

## Safety boundary

This release creates repository capability only. It does not:

- connect to Neon production during CI;
- export real account data;
- copy real evidence to any cloud target;
- delete telemetry;
- run migrations against production;
- resume or deploy Render;
- claim legal admissibility or legal-hold compliance.

## Required validation

Before merge, the exact PR head must pass:

1. `node --check scripts/db/export-account-evidence.mjs`
2. `npm run test:deploy:account-evidence`
3. `npm run release:check`
4. `npm run check`
5. full repository tests
6. production build and standard CI guards
7. disposable PostgreSQL schema bootstrap/migrations
8. account backup + evidence-export runtime certification
9. local production certification

## Proof ceiling

Successful CI proves repository contracts plus disposable-loopback PostgreSQL runtime behavior. It does **not** prove a production export, independently stored production preservation copies, formal chain-of-custody sufficiency, legal admissibility, or any Render/Neon recovery action. Production preservation remains unproven until R1.5 produces a verified real manifest and the required independent copies.
