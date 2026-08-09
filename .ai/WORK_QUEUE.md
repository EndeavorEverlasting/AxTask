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

## AXQ-001 — Production R1 read-only database forensics

- **Status:** OPERATOR
- **Priority:** P0
- **Owner:** operator
- **Branch / PR:** none
- **Scope:** read-only production database size/shape inspection required by the recovery sequence
- **Forbidden:** row mutation, retention cleanup, reclaim, migrations, Render resume/deploy
- **Dependencies:** none
- **References:** `docs/DB_RECOVERY_RUNBOOK.md`, `docs/ACCOUNT_EVIDENCE_PRESERVATION.md`, `scripts/db-size-audit.mjs`
- **Acceptance gate:** production R1 evidence records the current database/table size distribution and confirms the account/evidence scope needed for preservation
- **Gate:** requires operator-controlled production `DATABASE_URL` / Neon access; repository and disposable CI proof cannot satisfy live R1
- **Last proof:** merge:511522e1ba8c5eb45cf90c87fb30defd2973586e added the preservation tooling and recovery gates; no live R1 proof exists
- **Next action:** operator runs the read-only R1 procedure in `docs/DB_RECOVERY_RUNBOOK.md` against production and records sanitized proof outside Git
- **Updated:** 2026-08-09

## AXQ-002 — Production R1.5 portable account evidence preservation

- **Status:** BLOCKED
- **Priority:** P0
- **Owner:** unclaimed
- **Branch / PR:** none
- **Scope:** run the merged read-only account evidence exporter against production, verify hashes/sentinel, and create the required independently controlled preservation copies
- **Forbidden:** production row mutation, cleanup/reclaim, committing evidence bundles or secrets to Git
- **Dependencies:** AXQ-001
- **References:** `scripts/db/export-account-evidence.mjs`, `docs/ACCOUNT_EVIDENCE_PRESERVATION.md`, `docs/DB_RECOVERY_RUNBOOK.md`
- **Acceptance gate:** successful production export; `EXPORT_INCOMPLETE` absent without manual removal; manifest/per-file hashes verified; at least two independently controlled verified copies exist; attachment object bytes separately preserved when in scope
- **Gate:** blocked until AXQ-001 establishes current live scope; execution also requires operator-controlled production credentials and protected absolute output storage
- **Last proof:** workflow:31323886919 passed the disposable PostgreSQL account-evidence certification before PR #115 merged; no production evidence bundle exists
- **Next action:** after AXQ-001 is satisfied, operator executes the protected production R1.5 command documented in `docs/ACCOUNT_EVIDENCE_PRESERVATION.md` and records sanitized hash/copy proof
- **Updated:** 2026-08-09

## AXQ-003 — Production R3 raw backup and disposable restore proof

- **Status:** BLOCKED
- **Priority:** P0
- **Owner:** unclaimed
- **Branch / PR:** none
- **Scope:** raw PostgreSQL backup plus disposable restore verification required before destructive recovery work
- **Forbidden:** source cleanup, retention deletion, reclaim, Render resume/deploy before preservation gates are met
- **Dependencies:** AXQ-002
- **References:** `docs/DB_RECOVERY_RUNBOOK.md`, `docs/ACCOUNT_EVIDENCE_PRESERVATION.md`
- **Acceptance gate:** raw production backup exists in protected storage and restores successfully into a disposable database with the required verification evidence
- **Gate:** blocked until R1.5 preservation is complete; production backup requires operator-controlled database access and protected storage
- **Last proof:** repository/disposable CI validates backup/evidence tooling only; no raw production backup/restore proof exists
- **Next action:** after AXQ-002 is satisfied, operator runs the R3 backup + disposable restore procedure from `docs/DB_RECOVERY_RUNBOOK.md` and records sanitized proof
- **Updated:** 2026-08-09

## AXQ-004 — Evaluate production containment / telemetry cleanup

- **Status:** BLOCKED
- **Priority:** P0
- **Owner:** unclaimed
- **Branch / PR:** none
- **Scope:** evaluate the smallest safe containment/cleanup action for pathological production telemetry after preservation gates are proven
- **Forbidden:** any destructive database action before AXQ-002 and AXQ-003 are complete; broad deletion without scoped diagnosis; bypassing recovery doctrine
- **Dependencies:** AXQ-002, AXQ-003
- **References:** `docs/DB_RECOVERY_RUNBOOK.md`, `docs/DB_RETENTION_POLICY.md`, `scripts/db-reclaim.mjs`
- **Acceptance gate:** a bounded, evidence-backed cleanup/containment action is either safely executed with proof or explicitly rejected as unnecessary; post-action storage/health proof is captured
- **Gate:** destructive production work is forbidden until both preservation gates complete and an operator authorizes the exact mutation
- **Last proof:** none
- **Next action:** once AXQ-002 and AXQ-003 are DONE, re-read current production evidence and recovery doctrine, then prepare/execute only the smallest operator-authorized mutation with rollback/proof
- **Updated:** 2026-08-09

## AXQ-005 — Render recovery and controlled deployment from current main

- **Status:** OPERATOR
- **Priority:** P1
- **Owner:** operator
- **Branch / PR:** none
- **Scope:** establish current Render provider state, then—only after database recovery dependencies permit it—reconcile service configuration with current `main`, perform one controlled exact-commit deployment, and capture live health/startup proof
- **Forbidden:** assuming historical suspension is still current, repeated blind resumes/deploys, bypassing R1.5/R3, assuming `render.yaml` automatically governs the existing manually configured Docker service, exposing secrets
- **Dependencies:** AXQ-004
- **References:** `render.yaml`, `Dockerfile`, `scripts/production-start.mjs`, `docs/DB_RECOVERY_RUNBOOK.md`, `docs/ENVIRONMENT_VARIABLES.md`
- **Acceptance gate:** current provider state is revalidated; after AXQ-004 is DONE, the exact intended `main` commit is deployed once under verified environment/health settings; startup gates and Render health succeed; live proof is recorded without secrets
- **Gate:** current live Render state is unverified and requires operator/provider inspection; any resume/deploy action remains additionally blocked by AXQ-004 until the database recovery sequence permits it
- **Last proof:** historical operator evidence on 2026-08-09 showed the service suspended after repeated crashes, but that state must not be treated as current without revalidation; no current live Render proof exists
- **Next action:** operator opens the AxTask Render service and records the current service state, linked branch, health-check path, and auto-deploy mode without changing or exposing environment-secret values; do not resume or deploy while AXQ-004 remains incomplete
- **Updated:** 2026-08-09
