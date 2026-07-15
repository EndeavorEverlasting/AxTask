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
- Pairs with merged PR #72 (`SECURITY_API_REQUEST_LOGGING` gate and migration `9999` containment). Do not weaken or remove those boundaries when changing this feature.

## Database

No schema shape changes.

## Validation

Original targeted checks:

- `npm run check`
- `npx vitest run server/scheduled-resource-controls.contract.test.ts`
- `npx vitest run server/routes-inventory.contract.test.ts`
- `node scripts/release-check.mjs`

Clean rebuild proof, 2026-07-15:

- Rebuilt from current `main` in replacement PR #73 while preserving PR #72 telemetry containment.
- Validated source commit: `0a7e3847d3112575e38b34de7deb6deb04219d6b`.
- GitHub Actions repair run: `29429736671`.
- Passed `git diff --check` on the staged recovery surface.
- Passed the scheduled-resource, DB-size, route-inventory, and API-request logging contract tests.
- Passed `npm run env:audit:strict`.
- Passed `npm run release:check`.
- Passed `npm run check`.
- Passed the full `npm test` suite.
- Passed `npm run build`.
- The temporary rebuild workflow and repair script deleted themselves before the validated commit was pushed.
