Repo: EndeavorEverlasting/AxTask
Run from: a clean local AxTask checkout on the current non-production working branch, with current main and open PR evidence available.

Sprint: AxTask DeepSeek Overnight Evidence-to-Repair
Lane: one reproducible, non-colliding failure cluster
Run profile: OVERNIGHT

Dependencies:
- AgentSwitchboard must report the OpenCode adapter READY.
- The exact DeepSeek provider/model must pass AgentSwitchboard's bounded spawnability probe before repository work starts.
- Provider authentication must already exist in OpenCode's local credential store; never request, print, copy, or commit a provider key.
- Existing npm dependencies must already be installed or installable through the repository's normal lockfile-preserving workflow.

Authority and inspection order:
1. Current Git state and executable repository contracts.
2. AGENTS.md.
3. AGENT_GUARDRAILS.md.
4. `.ai/authority.json`, `.ai/harness.json`, and the workflow selected by the harness.
5. The nearest scoped rules and canonical document for the selected failure cluster.
6. Package scripts, current tests, the collision ledger, open PRs, and recent commits.
7. Old plans and historical platform notes only when current evidence points to them.

Owned scope:
- Read-only repository inspection needed to select one safe cluster.
- Mutation only in the smallest set of application, test, and directly related documentation files required to repair one root cause.
- Allowed implementation roots after evidence selection: client/src/, server/, shared/, tests/, tools/, and non-authoritative docs supporting the selected cluster.
- One operator report at docs/ops/gnhf/AXTASK_NIGHT_REPORT.md.
- At most one coherent implementation commit for the selected cluster, plus a report-only blocker commit when no safe implementation can be made.

Forbidden scope:
- No direct mutation of main or any production-connected branch.
- No overlap with files or behavior already owned by an open PR unless that PR is explicitly abandoned in current repository evidence.
- No render.yaml, deployment workflow, production-start, Docker production, DNS, domain, redirect, cookie-domain, or live-host changes.
- No migrations/, shared/schema.ts, drizzle.config.ts, Drizzle push, production schema, database restore, destructive SQL, or live Neon/PostgreSQL actions.
- No authentication, session, MFA, admin authorization, secret generation, provider credentials, environment values, or client-visible privacy boundary changes.
- No scheduled-worker, cron, reminder dispatch, archetype rollup, database snapshot, backup-worker, or resource-control activation.
- No package.json, lockfile, dependency, lifecycle-script, or supply-chain changes unless the selected failure is reproducibly inside the existing dependency contract and no lower-risk repair exists.
- No editing generated runtime evidence, TEST_ATTESTATION.md, huge logs, crash dumps, machine-local files, or private user data.
- No push, merge, deployment, release, tag, production mutation, or remote PR cleanup.

Objective:
Recover current AxTask truth, run the collision-inspection capability when parallel ownership is possible, identify the highest-value reproducible failure cluster that is not already owned by an open PR, repair its smallest shared root cause, add deterministic enforcement, validate the repair, and commit the result in the isolated GNHF worktree.

Selection rules:
- Prefer an already failing repository test, validator, type check, build contract, or documented active gap with direct file-path evidence.
- Group no more than five closely related failures under one root-cause hypothesis.
- Reject broad symptom chasing, speculative refactors, stale-plan implementation, and unrelated cleanup.
- Do not select deployment, schema, authentication, live-database, scheduled-resource, or provider-routing work in this run.
- Record why the selected cluster is higher value and safer than the next two candidates.

Execution loop:
1. Run the compact Git floor: git status --short; git branch --show-current; git log --oneline --decorate -5.
2. Confirm the worktree is clean and isolated. Preserve unknown state; never reset, clean, stash, or discard another lane's work.
3. Read AGENTS.md, AGENT_GUARDRAILS.md, `.ai/authority.json`, and `.ai/harness.json`, then load only the workflow and tests governing the candidate cluster.
4. Inspect current open PRs, recent commits, and the collision ledger before choosing files.
5. Run npm run check. Use its evidence plus existing targeted tests or validators to form one cluster of at most five related failures.
6. Reproduce the cluster with the narrowest practical command. Capture the exact command, exit code, failing test names, and concise error signature in AXTASK_NIGHT_REPORT.md.
7. State one root-cause hypothesis and the exact owned files before editing.
8. Make the smallest useful tracked repair. Do not replace real behavior with stubs, broad mocks, disabled checks, skipped tests, relaxed budgets, or swallowed errors.
9. Add or update deterministic enforcement that fails before the repair and passes after it.
10. Run the targeted test or validator first, then npm run check.
11. Run npm run perf:bundle only when the repair can affect client bundle size. Run npm run perf:api-replay only when it can affect API latency.
12. Review git diff --check, git status --short, git diff --stat, and git diff.
13. Update AXTASK_NIGHT_REPORT.md with selection evidence, files changed, validation actually run, skipped checks, proof level, proof ceiling, and remaining risk.
14. Commit one coherent repair using a conventional message. Do not push.
15. Stop when the positive completion condition is true.

No-progress rule:
- Stop after two consecutive iterations produce no tracked diff, no stronger reproduction, and no narrower root-cause evidence.
- Stop after the same unchanged failure signature repeats twice after a repair attempt.
- Preserve the branch, worktree, report, logs, and review commands.
- When a useful code repair cannot be made safely, commit only AXTASK_NIGHT_REPORT.md with the exact blocker, evidence, collision, and smallest next command.

Operational-failure rule:
- Provider authentication, quota, rate limit, network, model discovery, spawn timeout, malformed agent output, terminal, GNHF, OpenCode, or AgentSwitchboard failures are operational failures, not AxTask code failures.
- Do not modify AxTask to compensate for an operational failure.
- Record the exact operational evidence and stop without claiming repository progress.

Positive completion condition:
One non-colliding AxTask root cause is repaired in the isolated worktree, deterministic targeted enforcement passes, npm run check passes, AXTASK_NIGHT_REPORT.md records honest evidence, and one coherent local commit is ahead of the base; or a report-only commit proves with exact evidence why no safe implementation was available.

Required tracked deliverable:
- Preferred: one local commit containing the bounded repair, deterministic enforcement, and docs/ops/gnhf/AXTASK_NIGHT_REPORT.md.
- Blocked path: one local report-only commit containing the exact blocker, evidence, collision analysis, and smallest safe next command.
- Process exit code zero, a model response, or an uncommitted diff is not delivery proof.

Validation floor:
- npm run check
- the narrowest relevant npx vitest run <targeted-test-paths> or canonical validator command
- git diff --check
- conditional npm run perf:bundle for client bundle impact
- conditional npm run perf:api-replay for API latency impact

Commit contract:
- Stage only owned tracked files.
- Use one conventional commit message describing the repaired root cause or evidence-backed blocker.
- Do not push, merge, deploy, release, tag, or mutate live state.

Final report:
- selected failure cluster and rejected alternatives
- root cause and evidence
- files changed
- commit SHA
- targeted validation actually run and results
- broader validation actually run and results
- skipped checks with reasons and exact later commands
- proof level and proof ceiling
- remaining blockers, collision risks, and rollback note
- final git status --short
- one exact morning review command

Proof ceiling:
Repository evidence, local tests, validators, type checks, builds, and a local commit can prove only the isolated checkout state. They do not prove a pushed branch, reviewed PR, merged code, Render deployment, Neon migration, production behavior, live user impact, or provider reliability beyond the bounded preflight response.
