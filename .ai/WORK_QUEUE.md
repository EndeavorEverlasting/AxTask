authorityRef: axtask.agent-authority.v1

# AxTask shared agent work queue

This is the canonical **coordination ledger** for unfinished repository work. Every user and agent may update it. It is intentionally short on implementation prose: the repository, linked issues/PRs, tests, runbooks, and source files remain the authority for how each component actually works.

The queue never overrides `AGENTS.md`, `AGENT_GUARDRAILS.md`, `.ai/authority.json`, executable contracts, or current repository/runtime evidence. Before acting on a queue item, reconcile it against current `main`, open PRs, CI, provider state, and the referenced files. If reality has moved, update this ledger first.

## Agentic continuation contract

1. **Read this file at intake.** Pick the highest-priority unblocked item that is inside your available tools and permissions.
2. **Claim before substantial mutation.** Set `Status` to `CLAIMED`, identify the owner/session, branch, and current proof. Re-read the latest queue before editing so another agent's claim is not overwritten.
3. **Execute through the next real boundary.** Editing, targeted validation, broader validation, commit, push, PR creation/update, CI repair, review-thread repair, and merge are one continuous task when they are safe, authorized, and tool-accessible.
4. **Continuation states are not stopping states.** `VERIFY`, `REVIEW`, and `MERGE` mean the current agent should continue immediately when it has the required access. Do not hand work back merely because tests passed, a PR opened, or CI turned green.
5. **PR opened is not completion.** If the acceptance gate includes merge and no human-only approval, forbidden-scope boundary, collision, or failing check remains, watch the exact PR head, repair failures/reviews, and merge with expected-head protection.
6. **Merge is not automatically completion.** If deploy/runtime proof is explicitly in scope and safe, continue. If production access, destructive mutation, credentials, or human authorization is required, move to `OPERATOR` or `BLOCKED` with the exact gate.
7. **Stop only at a legitimate boundary.** Valid stopping states are `DONE`, `BLOCKED`, or `OPERATOR`. A collision may be represented as `BLOCKED` with the conflicting branch/PR named.
8. **Update before stopping.** Record the strongest proof achieved, the exact unresolved gate, and the first executable next action. Never leave a vague “test/review/merge/deploy later” handoff.
9. **DONE is strict.** `DONE` means the acceptance gate is satisfied and **no safe actionable work remains inside the item's scope**. `Last proof` must identify durable evidence and `Next action` must be exactly `none; no safe actionable work remains`.
10. **Preserve concurrent work.** Never delete or rewrite another active item to make your branch easier to merge. Rebase/reconcile the queue block you own and preserve other agents' newer entries.

### Status vocabulary

- `READY` — unclaimed and executable now.
- `CLAIMED` — an agent/session is actively executing it.
- `VERIFY` — implementation exists; validation remains. Continue when tools are available.
- `REVIEW` — PR/review repair remains. Continue when tools are available.
- `MERGE` — checks/review are satisfied or nearly satisfied; merge convergence remains. Continue when authorized.
- `OPERATOR` — next progress requires human-controlled credentials, production/runtime access, explicit approval, provider-state inspection, or another operator-only action.
- `BLOCKED` — a concrete dependency, collision, failing external service, or forbidden-scope boundary prevents progress.
- `DONE` — acceptance gate satisfied; no safe actionable work remains in scope.

## Durable proof tokens

A `DONE` task must put at least one machine-recognizable durable evidence token in `Last proof`:

- `commit:<git-sha>`
- `merge:<git-sha>`
- `workflow:<github-actions-run-id>` or `run:<github-actions-run-id>`
- `artifact:<durable-path-or-reference>`
- `operator-proof:<durable-external-reference>`

Plain prose such as `completed successfully` is not sufficient DONE proof. A PR number alone is also not sufficient because an open PR is a continuation state, not completion evidence.

## Task block contract

Every `AXQ-*` task block must use the canonical heading `## AXQ-### — Title` and keep these fields with non-blank values. Add concise links/paths instead of copying long implementation notes into this file.

- **Status:** one value from the vocabulary above
- **Priority:** `P0`, `P1`, `P2`, or `P3`
- **Owner:** agent/session identifier, `operator`, or `unclaimed`
- **Branch / PR:** branch and PR when applicable, otherwise `none`
- **Scope:** what this item owns
- **Forbidden:** what it must not change/do
- **Dependencies:** queue IDs or `none`
- **References:** authoritative repo paths/issues/PRs
- **Acceptance gate:** observable condition for completion
- **Gate:** exact blocker/operator gate, or `none`
- **Last proof:** strongest durable evidence already obtained, or `none`
- **Next action:** first executable action that advances the item
- **Updated:** UTC date or timestamp

---

## Urgent recovery concurrency

Deployment recovery must not serialize independent preservation and local-proof work behind one operator step. Follow `docs/DB_RECOVERY_SUBPART_WAVE.md`:

- **Wave A current:** AXQ-001 R1 operator evidence and AXQ-003 R3 source-read-only backup/restore may proceed in parallel. AXQ-007 R7 local certification is already `DONE` on the current candidate floor.
- **Naming:** R3 is backup and rollback proof. Physical reclaim is R5/AXQ-008, never R3. Do not describe or execute an "R3 reclaim path."
- **Wave B after R1:** AXQ-002 R1.5 evidence preservation and AXQ-006 R2 containment assessment proceed in parallel. Any R2 mutation still waits for AXQ-003.
- **Wave C:** AXQ-004 R4 cleanup only after AXQ-002, AXQ-003, and AXQ-006 satisfy their gates.
- **Wave D:** AXQ-008 R5/R6 physical-capacity convergence.
- **Wave E:** AXQ-005 one controlled Render recovery only after AXQ-008; AXQ-007 is already satisfied. Deployment authorization remains **NO** until that gate.

## AXQ-001 — Production R1 read-only database forensics

- **Status:** OPERATOR
- **Priority:** P0
- **Owner:** operator
- **Branch / PR:** none
- **Scope:** read-only production database size/shape inspection required by the recovery sequence
- **Forbidden:** row mutation, retention cleanup, reclaim, migrations, Render resume/deploy
- **Dependencies:** none
- **References:** `docs/DB_RECOVERY_RUNBOOK.md`, `docs/ACCOUNT_EVIDENCE_PRESERVATION.md`, `scripts/db-size-audit.mjs`
- **Acceptance gate:** production R1 evidence records current database/table size distribution, exact `security_events` event mix/timestamps, containment-trigger state, and migration-9999 ledger state
- **Gate:** requires operator-controlled production `DATABASE_URL` / Neon access; repository and disposable CI proof cannot satisfy live R1
- **Last proof:** artifact:docs/DB_RECOVERY_RUNBOOK.md records the verified incident floor (36.20 GB database, 36.19 GB `security_events`, 10.00 GB configured capacity-budget hard fail); no durable live `production-audit.json` proving exact event mix/trigger/migration state is recorded in this queue
- **Next action:** operator runs the read-only R1 procedure in `docs/DB_RECOVERY_RUNBOOK.md` against production and records sanitized proof outside Git while AXQ-003 proceeds independently
- **Updated:** 2026-09-06T16:34:00Z

## AXQ-002 — Production R1.5 portable account evidence preservation

- **Status:** BLOCKED
- **Priority:** P0
- **Owner:** unclaimed
- **Branch / PR:** none
- **Scope:** run the merged read-only account evidence exporter against production, verify hashes/sentinel, and create the required independently controlled preservation copies
- **Forbidden:** production row mutation, cleanup/reclaim, committing evidence bundles or secrets to Git
- **Dependencies:** AXQ-001
- **References:** `scripts/db/export-account-evidence.mjs`, `docs/ACCOUNT_EVIDENCE_PRESERVATION.md`, `docs/DB_RECOVERY_RUNBOOK.md`, `docs/DB_RECOVERY_SUBPART_WAVE.md`
- **Acceptance gate:** successful production export; `EXPORT_INCOMPLETE` absent without manual removal; manifest/per-file hashes verified; at least two independently controlled verified copies exist; attachment object bytes separately preserved when in scope
- **Gate:** blocked until AXQ-001 establishes current live scope; execution also requires operator-controlled production credentials and protected absolute output storage
- **Last proof:** workflow:31323886919 passed disposable PostgreSQL account-evidence certification before PR #115 merged; no production evidence bundle exists
- **Next action:** immediately after AXQ-001 is satisfied, Sub-Part C executes the protected R1.5 command and copy verification while AXQ-006 performs containment assessment
- **Updated:** 2026-08-11T17:36:00Z

## AXQ-003 — Production R3 source-read-only backup and disposable restore proof

- **Status:** OPERATOR
- **Priority:** P0
- **Owner:** operator
- **Branch / PR:** none
- **Scope:** create one raw PostgreSQL backup without source-ledger mutation, verify its hash, then restore it into disposable PostgreSQL; this is backup and rollback proof, not physical reclaim
- **Forbidden:** source cleanup, retention deletion, source backup-ledger insertion during recovery, reclaim, Render resume/deploy
- **Dependencies:** none
- **References:** `docs/DB_RECOVERY_RUNBOOK.md`, `docs/DB_RECOVERY_SUBPART_WAVE.md`, `scripts/db/preflight-backup.mjs`, `scripts/db/backup.mjs`, `scripts/db/restore-test.mjs`
- **Acceptance gate:** protected dump + manifest exist; `sourceLedgerMode` is `skipped`; SHA-256 verifies; disposable restore succeeds; manifest records non-null `restoreTestedAt`
- **Gate:** requires operator-controlled production `DATABASE_URL`, `BACKUP_STORAGE_TARGET`, protected storage, PostgreSQL client tools, and a separate disposable `RESTORE_DATABASE_URL`
- **Last proof:** none
- **Next action:** operator runs `npm run db:backup:preflight -- --no-ledger`, preserves the printed `AXTASK_BACKUP_MANIFEST` path, then `npm run db:restore:test -- --recovery --file="<exact manifest path>"`; do not run a second `npm run db:backup`; physical reclaim remains AXQ-008/R5
- **Updated:** 2026-09-06T21:55:00Z

## AXQ-004 — Production R4 targeted logical cleanup

- **Status:** BLOCKED
- **Priority:** P0
- **Owner:** unclaimed
- **Branch / PR:** none
- **Scope:** bounded deletion of only eligible historical `api_request` rows followed by post-cleanup R1 audit
- **Forbidden:** starting before preservation/backup/containment gates, deleting non-`api_request` events, automatic `VACUUM FULL`, Render resume/deploy
- **Dependencies:** AXQ-002, AXQ-003, AXQ-006
- **References:** `docs/DB_RECOVERY_RUNBOOK.md`, `scripts/db-reclaim-api-request.mjs`
- **Acceptance gate:** authorized bounded cleanup completes with origin-active containment; no eligible historical `api_request` rows remain; post-cleanup R1 audit is preserved
- **Gate:** blocked until R1.5 preservation, R3 backup/restore, and R2 containment are all proven; destructive execution additionally requires operator authorization of the exact command
- **Last proof:** none
- **Next action:** after AXQ-002, AXQ-003, and AXQ-006 satisfy their gates, run the R4 dry run, review its exact target, then execute only the runbook-authorized bounded cleanup
- **Updated:** 2026-08-11T17:36:00Z

## AXQ-005 — Render recovery and controlled deployment from current main

- **Status:** BLOCKED
- **Priority:** P0
- **Owner:** operator
- **Branch / PR:** none
- **Scope:** reconcile current Render provider state with exact recovery-certified `main`, perform one controlled deployment, and capture live startup/health proof
- **Forbidden:** repeated blind resumes/deploys, bypassing recovery gates, assuming `render.yaml` automatically governs existing provider state, exposing secrets
- **Dependencies:** AXQ-007, AXQ-008
- **References:** `render.yaml`, `Dockerfile`, `scripts/production-start.mjs`, `docs/DB_RECOVERY_RUNBOOK.md`, `docs/ENVIRONMENT_VARIABLES.md`
- **Acceptance gate:** R0-R7 proof is recorded; exact intended `main` SHA is deployed once with verified environment/health settings; startup gates and Render health succeed; live proof is recorded without secrets
- **Gate:** AXQ-007 is satisfied; deployment remains blocked until AXQ-008 capacity convergence is complete and the operator explicitly authorizes the one R8 attempt
- **Last proof:** workflow:34050440866 proves current-candidate local production certification on merge:69818369c2e9635decd79c658af352e3ecb306ec; historical provider evidence showed suspension during the capacity incident; no current R8 live proof exists; deployment authorization remains NO
- **Next action:** when AXQ-008 is DONE, operator records exact current `main` SHA/provider settings and explicitly authorizes one R8 resume/deploy attempt
- **Updated:** 2026-09-06T21:55:00Z

## AXQ-006 — Production R2 containment assessment and repair

- **Status:** BLOCKED
- **Priority:** P0
- **Owner:** unclaimed
- **Branch / PR:** none
- **Scope:** establish that `trg_suppress_api_request_security_events` is origin-active; repair only that containment mechanism if R1 shows it is absent/disabled
- **Forbidden:** historical row deletion, general migrations, migration-ledger forgery, containment mutation before R3 restore proof, Render startup
- **Dependencies:** AXQ-001
- **References:** `docs/DB_RECOVERY_RUNBOOK.md`, `docs/DB_RECOVERY_SUBPART_WAVE.md`, `scripts/db-contain-api-request.mjs`
- **Acceptance gate:** durable evidence proves containment is origin-active; if it was already active no mutation occurs; if repair was required, AXQ-003 restore proof existed first and the authorized one-off containment command succeeded
- **Gate:** assessment waits for R1 trigger evidence; any containment mutation additionally waits for AXQ-003
- **Last proof:** none
- **Next action:** after AXQ-001, Sub-Part D runs `node scripts/db-contain-api-request.mjs --json`; record existing containment if active, otherwise wait for AXQ-003 then execute only the runbook-authorized containment repair
- **Updated:** 2026-08-11T17:36:00Z

## AXQ-007 — R7 local production certification

- **Status:** DONE
- **Priority:** P0
- **Owner:** repository-ci
- **Branch / PR:** main
- **Scope:** certify the exact recovery candidate against disposable local PostgreSQL and run deployment/build validators
- **Forbidden:** production credentials, production DB mutation, Render resume/deploy, claiming local proof as live deployment proof
- **Dependencies:** none
- **References:** `docs/DB_RECOVERY_RUNBOOK.md`, `docs/DB_RECOVERY_SUBPART_WAVE.md`, `.ai/workflows/local-deployment-certification.md`, `scripts/deploy/run-local-cert.mjs`
- **Acceptance gate:** local production certificate proves launcher start, `/health`, `/ready`, client shell, and fail-closed recovery defaults for the exact candidate SHA; deploy validators/build pass
- **Gate:** none
- **Last proof:** workflow:34050440866 passed typecheck, full tests, release guardrail, production build, Playwright regression, bundle budget, API latency replay, Drizzle bootstrap/migrations/idempotency, account-backup round trip, TOTP verification, local production certification, Docker build, and attestation on merge:69818369c2e9635decd79c658af352e3ecb306ec (PR #148); commit:cecb0e6c0f2637592bbae203560a4568aaeef63b is the subsequent `[skip ci]` test-attestation update containing that merge
- **Next action:** none; no safe actionable work remains
- **Updated:** 2026-09-06T21:55:00Z

## AXQ-008 — R5/R6 physical reclaim and capacity convergence

- **Status:** BLOCKED
- **Priority:** P0
- **Owner:** unclaimed
- **Branch / PR:** none
- **Scope:** decide from post-R4 evidence whether physical reclaim is required, perform it only if separately authorized, then establish the explicit R6 operational capacity policy
- **Forbidden:** automatic `VACUUM FULL`, capacity-bypass flags, reusing the obsolete 10 GiB assumption, Render resume/deploy
- **Dependencies:** AXQ-004
- **References:** `docs/DB_RECOVERY_RUNBOOK.md`, `scripts/db-reclaim-api-request.mjs`, `scripts/deploy/check-db-capacity.mjs`
- **Acceptance gate:** post-R4 physical-size evidence is recorded; R5 is either proven unnecessary or separately authorized/completed; R6 capacity check passes under an explicit deliberate operator budget decision or documented report-only policy
- **Gate:** blocked until R4 completes and post-cleanup physical size is known
- **Last proof:** none
- **Next action:** after AXQ-004, run the R5 dry run and post-cleanup size audit; if physical reclaim is unnecessary, skip it explicitly, then run `node scripts/deploy/check-db-capacity.mjs` under the chosen R6 policy
- **Updated:** 2026-08-11T17:36:00Z
