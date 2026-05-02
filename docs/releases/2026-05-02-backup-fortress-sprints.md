# Backup Fortress Sprints

## 1) Feature identity

- Feature name: Backup fortress sprints
- Branch: `feature/backup-fortress-sprints-2026-05-02`
- Date: 2026-05-02
- User-facing purpose: Strengthen recovery, backup safety, soft-delete recovery, and supporting operational guardrails without regressing existing API/client contracts.

## 2) Code touched

- Client files: trash-route wiring, backup contract coverage, and related contract/test updates.
- Server files: backup routes/services/workers, account backup, auth/account/collaboration/E2EE/avatar route registrars, DTO/privacy hardening, and startup guardrails.
- Shared schema/types: backup ledger tables/relations plus soft-delete and public DTO contract coverage.
- Routes added/changed: backup/restore flows, task restore/trash behavior, collaboration + DM/E2EE registrars, alarm companion bridge, notification/avatar voice endpoints.

## 3) Database impact

- New/expanded backup tables and FK coverage for backup records/jobs.
- Task soft-delete lifecycle support and retention-aware purge/restore coverage.
- Retention policy docs updated for backup ledgers.
- Migration/backfill needed: branch includes ordered SQL + Drizzle/schema sync work already tracked in the feature sprint.

## 4) Config impact

- New env groups on this branch: backup airlock/encryption, backup scheduler/queue/BullMQ toggles, S3/object-store replication, Redis/BullMQ wiring, alarm companion bridge, and native reminder feature flags.
- `.env.example` now documents the local-safe placeholders for those keys.

## 5) Verification

- `npm test` ✅ on 2026-05-02
- `npm run check` ✅ on 2026-05-02
- `npm run release:check` ✅ expected after this release doc + env template update
- Focused regression run for the 7 previously failing server contract tests ✅ on 2026-05-02

## 6) Risks / known limitations

- Backup automation remains opt-in; misconfigured scheduler/worker/BullMQ envs can still disable automation until corrected.
- Encrypted backup recovery depends on preserving `BACKUP_ENCRYPTION_KEY` outside the primary database blast radius.
- BullMQ mode requires separate Redis availability and operator monitoring.
- CI/merge readiness still depends on PR #49 checks turning green after the branch update is pushed.

## 7) Rollback

- Code rollback: revert/squash-revert the PR branch before or after merge.
- Runtime rollback: disable backup scheduler/BullMQ flags to return to manual/local backup flows.
- Data rollback: use the backup/restore drill path rather than ad-hoc direct DB mutation if branch migrations have already been applied.