# Render DB-free liveness floor

Date: 2026-07-15

## Diagnosis

Current `main` already exposes two intentionally different endpoints:

- `/health` is process liveness and does not query the database.
- `/ready` performs `SELECT 1` and is an explicit database-readiness probe.

Despite that split, `render.yaml` still configured `healthCheckPath: /ready`. Routine Render health probes therefore exercised Neon even when the application only needed a process-liveness signal.

## Change

- Point Render health checks to `/health`.
- Keep `/ready` mounted for explicit deploy smoke and operator DB-readiness checks.
- Strengthen the deploy health contract so `/ready` cannot silently return as the platform liveness path.
- Refresh `docs/SCHEDULED_RESOURCE_CONTROLS.md` to match the merged recovery floor:
  - PR #72 application-side `api_request` logging gate and migration `9999`
  - PR #73 scheduled-resource controls
  - PR #74 sidebar wallet polling removal
  - PR #68 remains a quarantined salvage source

## Scope

Changed surfaces:

- `render.yaml`
- `tests/deploy/06-health/health-contract.test.ts`
- `docs/SCHEDULED_RESOURCE_CONTROLS.md`
- this release note

Not changed:

- `/health` or `/ready` handlers
- database schema or migrations
- startup migration ordering
- worker enablement
- package scripts or workflows
- PR #68

## Rollout

Merging to `main` will allow Render auto-deploy to consume the updated blueprint/configuration path according to the repository's existing deployment setup. Verify the actual Render service configuration and deployed commit after merge; repository and CI proof alone do not prove the host applied the setting.

## Rollback

Restore `healthCheckPath: /ready` only if a documented host limitation requires DB readiness for rollback behavior. Doing so intentionally reintroduces periodic Neon queries and must be accompanied by an updated resource-control decision.

## Validation target

Repository proof:

- deploy health contract requires `healthCheckPath: /health`
- `/health` remains DB-free
- `/ready` remains DB-backed
- production startup retains capacity checks, deterministic SQL migrations, and skipped Drizzle push on Render

Runtime proof required after merge:

- deployed SHA and Render deployment ID
- `/health` success without DB access
- explicit `/ready` success when requested
- Render logs or metrics showing platform probes no longer target `/ready`

## Proof ceiling

This change can prove configuration and contract intent through CI. It cannot prove production adoption or a reduction in Neon compute until the merged commit is deployed and observed.
