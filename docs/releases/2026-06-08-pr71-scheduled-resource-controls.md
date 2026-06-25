# PR #71: gate scheduled workers and document resource controls

Date: 2026-06-08 (release note added 2026-06-25 during recovery sprint)

## Summary

- Gates scheduled/background resource usage with production-safe defaults in `render.yaml` (`DISABLE_REMINDER_DISPATCH`, `DISABLE_ARCHETYPE_ROLLUP`, `DISABLE_DB_SIZE_SNAPSHOT`, `DISABLE_OPS_SNAPSHOT`).
- Decouples `DISABLE_DB_SIZE_SNAPSHOT` from retention prune so daily DELETE sweeps continue without `pg_database_size` scans.
- Blocks admin usage snapshot capture when `DISABLE_OPS_SNAPSHOT=true`; adds `DISABLE_DB_RETENTION_CRON` kill-switch for nightly cron script.
- Adds canonical doc `docs/SCHEDULED_RESOURCE_CONTROLS.md` and contract tests.

## Operator notes

- In-process retention prune stays **on** by default (`DISABLE_RETENTION_PRUNE` unset). Set `DISABLE_RETENTION_PRUNE=true` only during a deliberate incident window.
- Render nightly cron retention stays **on** unless `DISABLE_DB_RETENTION_CRON=true` is set on the cron service.
- Pairs with PR #72 (`SECURITY_API_REQUEST_LOGGING` gate) for full telemetry pressure reduction; merge #72 before or with this PR in the recovery line.

## Database

No schema shape changes.

## Validation

- `npm run check`
- `npx vitest run server/scheduled-resource-controls.contract.test.ts`
- `npx vitest run server/routes-inventory.contract.test.ts`
- `node scripts/release-check.mjs`
