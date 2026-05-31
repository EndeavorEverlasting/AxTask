# PR #66: Ops recovery sprint and startup hardening

Date: 2026-05-29

## Summary

- Adds ops telemetry, health checks, and startup hardening.
- Introduces periodic ops snapshots for monitoring system health.
- Suppresses harmless drizzle-kit TTY warnings in CI/Render logs.
- Hardens production-start script with better error handling and stderr filtering.
- Updates documentation for Render/Neon operations and debugging.

## Database

No database shape changes. This PR focuses on operational telemetry and startup resilience.

## Validation

- `npm run check`
- `npm run release:check` (local validation of release contract)
- `npm run test:deploy:regression`
- `npm run build`
