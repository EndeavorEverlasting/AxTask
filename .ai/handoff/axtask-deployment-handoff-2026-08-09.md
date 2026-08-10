authorityRef: axtask.agent-authority.v1

# AxTask deployment/recovery handoff — 2026-08-09

- Repo: `EndeavorEverlasting/AxTask`
- Branch: `ops/axtask-deployment-handoff-20260809`
- Base: `main@605f169ddae6ef13de193e877523510f800d5eff` (attestation-only child of validated app commit `8d5f896351b52c60e02d7259e64bb21092a52fa7`)
- PR/sprint: PR #119; compressed **AxTask Deployment Checklist + AxTask Deployment Sprint Map**; deployment readiness / production DB recovery gate
- Lane: deployment readiness and recovery evidence
- Owned scope: deployment contracts, validators, recovery docs/handoff, read-only production forensics, CI/build proof
- Forbidden scope: production DB mutation before prerequisite evidence/backup gates, Render resume/deploy before R0–R7 are recorded and operator authorization exists, auto-deploy enablement, secret exposure, destructive cleanup outside `docs/DB_RECOVERY_RUNBOOK.md`

## What changed

- Reconciled the older Render deployment checklist with the newer repository recovery contract. The current runbook wins: Render remains suspended through R7; R8 is one explicitly authorized resume/deploy; R9 is the live observation gate.
- Verified deployment/recovery contracts from `package.json`, `.ai/WORK_QUEUE.md`, `.ai/workflows/predeploy-cost-readiness.md`, `scripts/ai-harness/evaluate-predeploy-readiness.mjs`, `render.yaml`, and `docs/DB_RECOVERY_RUNBOOK.md`.
- Executed live **read-only** Neon production forensics against project `odd-dream-81805958`, branch `br-steep-shape-an2l3fiv`, database `neondb`.
- Observed production database size about 36 GB; `public.security_events` has about 50.4M live rows; `trg_suppress_api_request_security_events` is absent. The migration-ledger table exists.
- Attempted the exact full-table `event_type` aggregation. It exceeded the connector timeout; no incomplete aggregate is promoted to proof.
- No production mutation, containment, cleanup, physical reclaim, Render resume, or deploy was performed.

## Files changed

- `.ai/handoff/axtask-deployment-handoff-2026-08-09.md` — durable evidence handoff only.

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
- PR #119 branch checks observed so far: PR file-limit PASS; Axios guard PASS; production-startup guard PASS; full `test-and-attest`/Docker validation still running at handoff update time.

## Skipped or incomplete checks

- Local container clone/build in this ChatGPT runtime: skipped because the container could not resolve GitHub; durable CI evidence used instead.
- Exact `security_events` event-type full aggregation: incomplete due connector timeout.
- R1 canonical `production-audit.json`: not yet produced in a durable operator shell.
- R1.5 protected account-evidence export and two independently controlled verified copies: not executed.
- R3 raw production backup plus disposable restore proof: not executed.
- R4 targeted cleanup, R5 optional physical reclaim, R6 post-recovery capacity decision, R8 Render resume/deploy, R9 observation: not executed because their dependencies are not met.

## Known gaps and risks

1. R1 is **partial**: exact event-type counts and oldest/newest evidence still require the repo-owned forensics command and durable `production-audit.json`.
2. R1.5 is open: preserve the required account evidence bundle, hashes, attachment objects when in scope, and two verified copies.
3. R2 is open: the suppression trigger is absent; containment mutation is prohibited until R3 backup/rollback evidence exists.
4. R3 is open: create and verify a raw production backup and disposable restore before containment mutation or cleanup.
5. R4–R7 depend on the earlier gates. R8 cannot occur until R0–R7 are recorded and an operator explicitly authorizes one live attempt. R9 follows the live recovery.
6. `security_events` is the dominant known capacity risk; unbounded aggregation through a short-lived connector can timeout. Use the repo-owned audit from a durable operator shell.

## Important paths

- `.ai/WORK_QUEUE.md`
- `.ai/workflows/predeploy-cost-readiness.md`
- `scripts/ai-harness/evaluate-predeploy-readiness.mjs`
- `scripts/db-size-audit.mjs`
- `scripts/db/export-account-evidence.mjs`
- `scripts/db-contain-api-request.mjs`
- `scripts/db-reclaim-api-request.mjs`
- `scripts/deploy/check-db-capacity.mjs`
- `scripts/deploy/run-local-cert.mjs`
- `docs/DB_RECOVERY_RUNBOOK.md`
- `docs/ACCOUNT_EVIDENCE_PRESERVATION.md`
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

## Git state

- Remote feature branch: `ops/axtask-deployment-handoff-20260809`
- PR: `#119` → `main`
- Base at branch creation: `605f169ddae6ef13de193e877523510f800d5eff`
- Working-tree status in this ChatGPT runtime: unavailable because the container cannot resolve GitHub; no local tree was mutated.
- Remote mutation is bounded to this one tracked handoff file.

## Next action contract

Owner: deployment/recovery operator or next agent with an authorized production `DATABASE_URL` in a durable shell.

Dependency: fetch PR #119 without force into an isolated worktree; verify its exact head; keep `DATABASE_URL` loaded through the normal secret path without printing it.

Action: validate the branch, then run the **repo-owned SELECT-only R1 command** from the runbook:

`node scripts/db-size-audit.mjs --forensics --json > production-audit.json`

Expected artifact: `production-audit.json` outside Git if it contains operational metadata, plus successful deployment validators/build.

Completion gate: the artifact contains total DB size; `security_events` relation/heap/index/TOAST size; estimated live/dead tuples; complete event-type counts and oldest/newest timestamps; `trg_suppress_api_request_security_events` state; and migration `9999_disable_api_request_security_events.sql` ledger state. If the audit cannot complete, R1 remains open and R1.5/R2/R3/R4–R9 remain dependency-blocked as defined by the runbook.