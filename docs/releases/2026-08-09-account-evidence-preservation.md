# 2026-08-09 — Account Evidence Preservation and Provider Portability

## Objective

Prevent database-capacity recovery from deleting account-linked records before a portable, independently verifiable preservation artifact exists.

## Incident context

The production database was measured at approximately 36.20 GB with approximately 36.19 GB concentrated in `security_events`. Render remains suspended. No production database mutation or Render resume is part of this release.

The existing Backup Center account export is restore-oriented and intentionally smaller than the database. The migration-style user export also does not include `security_events`. That left a preservation gap before targeted telemetry cleanup.

## Delivered

- `scripts/db/export-account-evidence.mjs`
  - PostgreSQL `REPEATABLE READ READ ONLY` snapshot;
  - exactly one account selected by user ID or email;
  - public base-table-only discovery;
  - dynamic export of directly account-linked and task/invoice/attachment-linked rows;
  - bounded cursor streaming to JSONL rather than in-memory accumulation;
  - non-loopback reads require explicit `--prod --force-production` intent;
  - no database mutation path;
  - no `DATABASE_URL` logging;
  - secret/ephemeral tables excluded and sensitive account columns redacted;
  - per-file SHA-256 plus `manifest.json` and `manifest.sha256`;
  - `EXPORT_INCOMPLETE` remains on any interrupted/failed bundle and is removed only after successful snapshot commit plus manifest creation;
  - non-secret database target fingerprint and source Git commit in the manifest.
- High-volume `api_request` policy:
  - default `summary` mode exports meaningful security events row-for-row;
  - preserves `api_request` count, time range, daily counts, and first/last hash-chain anchors;
  - explicit `all` mode is available when individual telemetry rows must be preserved and sufficient external storage is available;
  - explicit `exclude` mode is recorded rather than silent.
- `docs/ACCOUNT_EVIDENCE_PRESERVATION.md`
  - verification and independent-copy procedure;
  - incomplete-bundle rejection rule;
  - raw DB dump versus portable account artifact distinction;
  - provider-independence model;
  - attachment-object preservation boundary.
- `docs/DB_RECOVERY_RUNBOOK.md`
  - adds mandatory R1.5 account-evidence preservation before R4 destructive cleanup;
  - requires both R1.5 evidence and R3 raw backup/restore proof before deletion.
- `tests/db/account-evidence-export.contract.test.ts`
  - Node syntax check;
  - read-only transaction contract;
  - base-table discovery contract;
  - no SQL mutation execution path;
  - non-loopback intent gate;
  - bounded streaming;
  - account-link coverage;
  - high-volume telemetry policy;
  - credential exclusion/redaction;
  - incomplete-marker lifecycle;
  - artifact hashing.
- `server/account-evidence-export.integration.test.ts`
  - loopback/disposable PostgreSQL only;
  - seeds one account, meaningful security events, and historical `api_request` telemetry;
  - restores the production containment trigger before exporter execution;
  - runs the real CLI;
  - verifies sentinel removal, manifest and per-file hashes, secret redaction, meaningful-event preservation, `api_request` summary anchors, excluded credential table behavior, and before/after source row-count equality.
- `scripts/db/run-local-account-backup-cert.mjs`
  - runs the evidence-export integration test after schema bootstrap/migrations as part of the existing disposable account-backup certification lane.

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
2. `npx vitest run tests/db/account-evidence-export.contract.test.ts`
3. `npm run release:check`
4. `npm run check`
5. full repository tests
6. production build and standard CI guards
7. disposable PostgreSQL schema bootstrap/migrations
8. account backup + evidence-export runtime certification
9. local production certification

## Proof ceiling

Successful CI proves repository contracts plus disposable-loopback PostgreSQL runtime behavior. It does **not** prove a production export, an independently stored preservation copy, formal chain-of-custody sufficiency, legal admissibility, or any Render/Neon recovery action. Production preservation remains unproven until R1.5 produces a verified real manifest and independently controlled copy.
