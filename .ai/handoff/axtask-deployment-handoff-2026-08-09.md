# AxTask deployment/recovery handoff — 2026-08-09

- Repo: `EndeavorEverlasting/AxTask`
- Branch: `ops/axtask-deployment-handoff-20260809`
- Base: `main@605f169ddae6ef13de193e877523510f800d5eff` (attestation-only child of validated app commit `8d5f896351b52c60e02d7259e64bb21092a52fa7`)
- PR/sprint: compressed **AxTask Deployment Checklist + AxTask Deployment Sprint Map**; deployment readiness / production DB recovery gate
- Lane: deployment readiness and recovery evidence
- Owned scope: deployment contracts, validators, recovery docs/handoff, read-only production forensics, CI/build proof
- Forbidden scope: production DB mutation before R1/R1.5/R3 evidence gates, Render resume/deploy, auto-deploy enablement, secret exposure, destructive cleanup, bypassing `docs/DB_RECOVERY_RUNBOOK.md`

## What changed

- Reconciled the older Render deployment checklist with the newer repository recovery contract. The recovery contract wins: Render stays suspended and auto-deploy stays off until recovery gates are passed.
- Verified current deployment scripts/contracts from `package.json`, `.ai/WORK_QUEUE.md`, `.ai/workflows/predeploy-cost-readiness.md`, `scripts/ai-harness/evaluate-predeploy-readiness.mjs`, `render.yaml`, and `docs/DB_RECOVERY_RUNBOOK.md`.
- Executed live **read-only** Neon production forensics against project `odd-dream-81805958`, branch `br-steep-shape-an2l3fiv`, database `neondb`.
- Observed production database size about 36 GB; `public.security_events` has about 50.4M live rows; the suppression trigger is absent. The migration ledger table exists.
- Attempted the exact full-table `event_type` aggregation. It exceeded the connector timeout; no incomplete aggregate is promoted to proof.
- No production mutation, cleanup, Render resume, or deploy was performed.

## Files changed

- `.ai/handoff/axtask-deployment-handoff-2026-08-09.md` — this durable handoff only.

## Artifacts produced

- This tracked handoff.
- Live Neon read-only evidence in the execution record for database identity/size, `security_events` row statistics, trigger state, and migration-ledger presence.
- Existing CI attestation: `docs/TEST_ATTESTATION.md` points to workflow run `31327530954` for `8d5f896351b52c60e02d7259e64bb21092a52fa7`.

## Validation run

- GitHub Actions `test-and-attest` run `31327530954`: PASS.
  - typecheck
  - unit/integration tests
  - release contract guardrail
  - production build
  - Playwright planner-scroll regression
  - client bundle budget
  - API latency replay
  - Drizzle bootstrap/migrations/idempotent push
  - account backup round-trip certification
  - TOTP schema verification
  - local production certification
- Docker build job in the same run: PASS, including bundled runtime assets.
- Production Neon read-only SQL: PASS for identity/size/table statistics/trigger/ledger metadata.

## Skipped or incomplete checks

- Local container clone/build in this ChatGPT runtime: skipped because the container could not resolve GitHub; CI evidence used instead.
- Exact `security_events` event-type full aggregation: incomplete due connector timeout.
- Protected account-evidence export: not executed; R1.5 evidence target/protected destination remains an operator gate.
- Raw production backup artifact: not created; R3 remains open.
- Production Render launcher/browser smoke: not run because recovery gates prohibit waking/deploying the service.

## Known gaps and risks

1. R1 is **partial**, not complete: exact event-type counts/oldest-newest evidence still need a canonical `db:size-audit:forensics` artifact.
2. R1.5 is open: export/preserve required account evidence to a protected destination before destructive work.
3. R2 is open: containment/suppression must not be applied until prerequisite evidence is captured.
4. R3 is open: create and verify a raw production backup before cleanup.
5. R4 cleanup/recovery and any Render resume/deploy remain blocked on R1→R3.
6. `security_events` is the dominant known capacity risk; performing an unbounded aggregate through a short-lived connector can timeout. Prefer the repo-owned audit command in a durable operator shell.

## Important paths

- `.ai/WORK_QUEUE.md`
- `.ai/workflows/predeploy-cost-readiness.md`
- `scripts/ai-harness/evaluate-predeploy-readiness.mjs`
- `scripts/db-size-audit.mjs`
- `docs/DB_RECOVERY_RUNBOOK.md`
- `docs/TEST_ATTESTATION.md`
- `render.yaml`
- `package.json`

## Proof ceiling

- contract proof: REACHED
- harness proof: REACHED at validated app commit `8d5f896351b52c60e02d7259e64bb21092a52fa7`
- static test proof: REACHED
- build proof: REACHED
- launcher/browser proof: REACHED for CI local-production/Playwright surfaces; production Render browser proof NOT REACHED
- command ACK proof: REACHED for read-only production Neon queries; deployment command ACK NOT REACHED
- behavior observed proof: PARTIAL — production DB state observed; production app behavior not observed
- live runtime proof: PARTIAL — live production DB only; Render app runtime remains intentionally suspended/unproven

## Next action contract

Owner: deployment/recovery operator or next agent with an authorized production `DATABASE_URL` in a durable shell.

Dependency: this branch/commit must be fetched and validated in an isolated worktree; production `DATABASE_URL` must be present without being printed.

Action: run the repo-owned deployment test suite and build, then execute `npm run db:size-audit:forensics -- --json` and persist the JSON as the canonical R1 evidence artifact. Do **not** mutate the database or resume Render.

Expected artifact: `artifacts/deploy/r1-db-forensics.json` plus successful deploy-test/build exits.

Completion gate: the artifact contains database size, table/index sizes, whale-table row counts, complete `securityEventsForensics.eventTypeCounts`, oldest/newest timestamps, trigger state, and migration-9999 ledger state. If the audit cannot complete, R1 remains open and R2/R3/R4/Render stay blocked.
