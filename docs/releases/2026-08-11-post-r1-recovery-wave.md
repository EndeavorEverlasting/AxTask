# Post-R1 recovery wave acceleration — 2026-08-11

## Scope

This release removes unnecessary serialization from the database-recovery workflow and hardens the R3 backup path for source-read-only preservation.

## Changes

- Adds `docs/DB_RECOVERY_SUBPART_WAVE.md` with explicit Sub-Part Agent lanes and convergence gates.
- Updates `.ai/WORK_QUEUE.md` so R3 backup/restore and R7 local certification are executable in parallel with R1 instead of waiting behind R1.5.
- Splits R2 containment assessment from R4 destructive cleanup and makes their dependencies explicit.
- Adds `--no-ledger` to `scripts/db/backup.mjs` so recovery backups can avoid inserting a `backup_records` row into the production source database.
- Propagates and verifies `--no-ledger` through `db:backup:preflight` and records `sourceLedgerMode` in the backup manifest.
- Corrects the R3 runbook sequence: `db:backup:preflight` already creates and verifies one dump, so recovery operators must not run a redundant second `db:backup`.
- Adds a recovery-wave validator and contract test so the safe parallel dependency graph cannot silently regress.

## Operational impact

After this release, three lanes can move immediately and independently while Render remains suspended:

1. R1 production SELECT-only forensics;
2. R3 source-read-only backup + disposable restore;
3. R7 disposable local production certification.

After R1 is accepted, R1.5 account evidence and R2 containment assessment may proceed in parallel. R4 remains blocked until R1.5, R3, and R2 containment are all proven.

## Safety and proof ceiling

- This release performs no production cleanup, containment mutation, physical reclaim, or Render action.
- Repository/CI proof cannot establish live R1/R1.5/R3/R4/R5/R8/R9 completion.
- `--no-ledger` is specifically for recovery contexts where a backup must not create a source-database ledger write.
- Raw dumps, account evidence, credentials, and machine-local paths remain outside Git.

## Validation

Required before merge:

```text
node scripts/ai-harness/validate-work-queue.mjs
node scripts/ai-harness/validate-recovery-wave.mjs
npx vitest run server/ai-harness/recovery-wave-contract.test.ts
npm run test:deploy:account-evidence
npm run release:check
npm run check
npm test
npm run build
git diff --check
```
