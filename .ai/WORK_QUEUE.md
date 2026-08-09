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

---

## Repository convergence and Lua architecture vision

This lane is intentionally separate from AXQ-001 through AXQ-005. Repository-only harness convergence may proceed while production recovery is operator-blocked, but it must not mutate production or weaken any R0-R9 recovery gate.

The target architecture is **less unnecessary process/state coupling, not serverless ideology and not a database purge**. Durable domain state may remain PostgreSQL-backed. `KEEP` is a valid architecture decision. Every stateful/runtime change must remain evidence-led, one surface and one migration seam at a time, under the registered stateful router and proof ceilings.

Lua is incorporated as a **bounded embedded scripting layer controlled by the host**, not as a new application sovereign. The host owns the execution loop, critical state, rollback, cleanup, performance-sensitive work, and error boundary. Lua VM states are independent/disposable; script errors tunnel to the host; capabilities are deny-by-default; OS/IO/filesystem/network/process/dynamic loading are not implicit; every exposed host function is individually declared and tested; runtime type checks and explicit 1-index translation are required; JIT remains off by default until benchmark and deoptimization evidence justify a separate decision.

Merging the Lua harness does **not** authorize a Lua dependency, Lua product files, a runtime adapter, JIT, or product behavior migration. Product/runtime Lua adoption is a later bounded seam and remains blocked until the current production baseline is recovered and the harness stack below has converged into `main`.

Repository convergence order is serial where shared harness ownership collides:

1. Repair, prove, and merge PR #121 — retention/capacity-defense harness foundation.
2. Reconcile PR #123 onto the resulting `main`, repair its remaining routing defects, prove, and merge — deterministic one-fact stateful execution.
3. Reconcile PR #125 onto the resulting `main`, preserve the Lua contracts and harness-only mutation boundary, rerun proof, and merge — Lua embedding control plane.
4. Only after AXQ-005 and AXQ-008 are DONE may a separate sprint evaluate one bounded Lua runtime pilot through the stateful router.

## AXQ-006 — Converge retention harness PR #121

- **Status:** REVIEW
- **Priority:** P1
- **Owner:** unclaimed
- **Branch / PR:** `feat/harness-log-retention-defense-20260809` / PR #121
- **Scope:** repair the retention validator and its focused contract tests, preserve existing retention semantics, obtain fresh exact-head proof, resolve review threads, and merge #121 into `main`
- **Forbidden:** product/runtime behavior changes, retention-window changes without separate evidence/authorization, production cleanup, Render mutation, force push, secret/raw-log tracking, modifications owned by #123 or #125
- **Dependencies:** none
- **References:** PR #121, `.ai/log-retention-contract.json`, `scripts/ai-harness/validate-log-retention.mjs`, `server/ai-harness/log-retention-harness-contract.test.ts`, `.github/workflows/harness-log-retention.yml`, `.ai/validator-registry.json`
- **Acceptance gate:** all six current review defects are correctly repaired or disproven with evidence; all review threads are resolved; retention/harness/full repository checks pass on the final exact head; #121 merges into `main` with expected-head protection; queue proof records the merge SHA
- **Gate:** six unresolved review threads remain despite green CI: robust Render service identification, retention-specific registry-field validation, formatting-independent semantic validation, explicit distinct sentinel coverage, complete policy/runner retention-window comparison, and rejection of commented-out runner entries
- **Last proof:** workflow:31331019375 and workflow:31331019398 passed on head `a04d36d39c74f98f525caf13350898ad620c803e`, but review defects remain unresolved and therefore the PR is not merge-ready
- **Next action:** OpenCode claims AXQ-006, fetches PR #121 exact head without force into an isolated worktree, repairs all six review findings in owned retention-harness files, runs the retention validator plus focused harness tests and selected full gates, pushes normally, resolves only proven-fixed threads, then merges #121 with expected-head protection if the final head is green and review-clean
- **Updated:** 2026-08-09T22:34Z

## AXQ-007 — Converge stateful single-fact harness PR #123

- **Status:** BLOCKED
- **Priority:** P1
- **Owner:** unclaimed
- **Branch / PR:** `harness/2026-08-09-stateful-task-execution-loop` / PR #123
- **Scope:** after #121 merges, reconcile #123 onto current `main`, preserve retention wiring, repair the two remaining stateful-router review defects, rerun exact-head harness/full proof, resolve review threads, and merge #123 into `main`
- **Forbidden:** bypassing AXQ-006, dropping #121 retention wiring during reconciliation, manual surface routing, proof-ceiling promotion, product/runtime mutation, provider selection, force push over unknown work, changing the Lua contract owned by #125
- **Dependencies:** AXQ-006
- **References:** PR #123, `.ai/stateful-execution-contract.json`, `.ai/architecture/surfaces/`, `scripts/ai-harness/next-stateful-task.mjs`, `scripts/ai-harness/validate-stateful-surface.mjs`, `server/ai-harness/stateful-task-loop-contract.test.ts`, `.github/workflows/harness-stateful-task-loop.yml`
- **Acceptance gate:** #123 is based on the post-#121 `main`; blocked gaps stop routing before later open gaps; a surface cannot become `COMPLETED` without a matching canonical ledger decision; all review threads are resolved; exact-head stateful/harness/full checks pass; #123 merges to `main` with expected-head protection
- **Gate:** blocked on AXQ-006; additionally two unresolved review threads remain on current head `810d66c6e8aca1ca80ba3f24094263f1c5e25947`
- **Last proof:** workflow:31333023347 and workflow:31333023325 passed on `810d66c6e8aca1ca80ba3f24094263f1c5e25947`; earlier review findings were repaired, but two final routing/decision defects remain unresolved
- **Next action:** after AXQ-006 records a merge SHA, OpenCode fetches current `main` and #123 without force, creates an isolated reconciliation worktree, preserves #121 changes, repairs blocked-gap precedence and ledger-decision completion enforcement with negative tests, retargets/reconciles #123 to `main`, runs exact-head stateful/harness/full gates, resolves proven-fixed threads, and merges #123 when green and review-clean
- **Updated:** 2026-08-09T22:34Z

## AXQ-008 — Converge Lua embedding harness PR #125

- **Status:** BLOCKED
- **Priority:** P1
- **Owner:** unclaimed
- **Branch / PR:** `harness/2026-08-09-lua-embedding-contract` / PR #125
- **Scope:** after #123 merges, reconcile #125 onto current `main`, preserve the Lua embedding/sandbox/proof contracts and this convergence ledger, rerun exact-head Lua/harness/full proof, resolve any new review findings, and merge #125 into `main`
- **Forbidden:** introducing a Lua runtime dependency, `.lua` product files, Lua runtime imports/markers, JIT, product behavior migration, OS/IO default access, wildcard host exposure, production mutation, or weakening the harness-only changed-path boundary
- **Dependencies:** AXQ-007
- **References:** PR #125, `.ai/lua-embedding-contract.json`, `.ai/lua-sandbox-capabilities.json`, `.ai/workflows/lua-embedding-integration.md`, `.ai/skills/lua-embedding-integration.md`, `scripts/ai-harness/validate-lua-embedding.mjs`, `server/ai-harness/lua-embedding-contract.test.ts`, `.github/workflows/harness-lua-embedding.yml`, `.ai/WORK_QUEUE.md`
- **Acceptance gate:** #125 is based on the post-#123 `main`; Lua remains `harness-only`; changed-path enforcement still rejects unauthorized Lua product/runtime introduction; all review threads are resolved; exact-head Lua/harness/full repository checks pass; #125 merges into `main` with expected-head protection; queue records merge proof
- **Gate:** blocked on AXQ-007; the pre-ledger head `e7e913e18128c9c6909b9a0cf056a2f01e78ecb4` was review-clean and fully green, but this ledger update creates a new head that must obtain fresh exact-head proof
- **Last proof:** workflow:31335080246 and workflow:31335080226 passed on `e7e913e18128c9c6909b9a0cf056a2f01e78ecb4`; both prior #125 review threads are resolved; fresh proof is required after this queue commit
- **Next action:** after AXQ-007 records a merge SHA, OpenCode fetches current `main` and current #125 head without force, creates an isolated reconciliation worktree, preserves the merged retention/stateful harness, reconciles #125 onto `main`, runs `git diff --check`, authority/harness/completeness/stateful/Lua validators, focused Lua tests and the selected full repository gates, resolves any new review findings, and merges #125 with expected-head protection when exact-head proof is green
- **Updated:** 2026-08-09T22:34Z

## AXQ-009 — Evaluate one bounded Lua runtime pilot

- **Status:** BLOCKED
- **Priority:** P2
- **Owner:** unclaimed
- **Branch / PR:** none
- **Scope:** select and prove exactly one minimal product/runtime Lua integration seam using the merged stateful router and Lua embedding contract; keep domain behavior host-owned and preserve rollback
- **Forbidden:** starting before AXQ-005 and AXQ-008 are DONE; broad “make AxTask Lua” rewrites; database replacement by ideology; default OS/IO/filesystem/network/process exposure; wildcard host APIs; hidden business logic in prompts; JIT without separate benchmark/deoptimization proof; multiple migration seams in one sprint
- **Dependencies:** AXQ-005, AXQ-008
- **References:** `.ai/lua-embedding-contract.json`, `.ai/lua-sandbox-capabilities.json`, `.ai/stateful-surface-ledger.json`, `.ai/stateful-execution-contract.json`, `.ai/workflows/lua-embedding-integration.md`, `.ai/workflows/stateful-architecture-migration.md`
- **Acceptance gate:** the stateful router identifies one evidence-backed seam; the host/Lua API is explicitly allowlisted; VM lifecycle/error cleanup/type/index boundaries have executable tests; the pilot demonstrates only the proof level actually executed; rollback is explicit; no second seam is started
- **Gate:** blocked until repository harness convergence completes and the current production baseline has recovered through AXQ-005
- **Last proof:** harness-only Lua contract proof exists on PR #125; no Lua product/runtime implementation proof exists or is implied
- **Next action:** when both dependencies are DONE, run the merged stateful router to select the first eligible Lua-related migration fact; do not choose a provider, adapter, or product seam manually before that routing evidence exists
- **Updated:** 2026-08-09T22:34Z
