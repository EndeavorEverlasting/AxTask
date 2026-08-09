# R1 production forensics hardening — 2026-08-09

## Scope

This release hardens the SELECT-only production database audit used by the AxTask R1 recovery gate. It does not authorize production mutation or Render resume/deploy.

## Changes

- `scripts/db-size-audit.mjs --forensics` no longer performs a separate exact `COUNT(*)` scan of `public.security_events` before the forensic aggregate.
- Exact event-type counts and each type's oldest/newest timestamp are collected in one `GROUP BY event_type` scan.
- The `security_events` whale-row count is derived from that same exact aggregate.
- Required forensic stages now record completion/error state.
- In forensics mode, incomplete required evidence exits nonzero after emitting the JSON report so a partial audit cannot be mistaken for an R1 success.
- Deployment contract tests lock the single-pass and fail-closed behavior.
- The merged deployment handoff is bound to canonical authority `axtask.agent-authority.v1` after CI exposed the missing reference.

## Safety and proof ceiling

- Audit SQL remains read-only; this change adds no `DELETE`, `TRUNCATE`, or `VACUUM FULL` path.
- Production `DATABASE_URL` is never committed or logged by this release.
- Repository tests/builds can prove the audit contract and executable packaging, but cannot complete R1 without running the canonical command against the authorized production database and preserving `production-audit.json`.
- Keep Render suspended and follow `docs/DB_RECOVERY_RUNBOOK.md`; R1 completion does not authorize containment or cleanup.

## Validation

Required before merge:

```text
npm run check
npm test
npm run release:check
npm run build
```

The CI workflow additionally exercises the Docker image, deployment contracts, Playwright regression, migration/backup certification, and local production certification after the release guardrail passes.
