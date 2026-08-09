# Harness log-retention capacity defense

Date: 2026-08-09

## Summary

Adds a repo-local harness lane that keeps AxTask's log/database retention defenses visible and machine-checked before append-only tables can silently drift back toward unbounded growth.

## Harness changes

- registers a log-retention workflow, skill, contract, validator, proof artifact, and operator report;
- cross-checks `docs/DB_RETENTION_POLICY.md`, `scripts/db-retention.mjs`, `render.yaml`, and `docs/SCHEDULED_RESOURCE_CONTROLS.md`;
- pins the known capacity sentinels `security_events` and `foundry_run_logs` to their documented 90-day windows;
- proves the repository still wires `axtask-db-retention` to run `node scripts/db-retention.mjs` daily at 04:15 UTC with `DATABASE_URL`;
- runs the retention harness validator and its contract test from the opt-in pre-push hook;
- explicitly prevents repository configuration from being misreported as live Render execution proof.

## Safety / proof boundary

This sprint changes harness infrastructure only. It does not delete production rows, change retention windows, alter product logging behavior, resume Render, expose credentials, or perform database reclaim. Live cron existence/enabled state and successful execution still require authorized runtime evidence.
