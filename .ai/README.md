# AxTask repository AI harness

This directory is the machine-readable operating layer for repository agents. Prompts may be produced by workflows, but prompts are artifacts, not the harness.

## Start here

1. Read `AGENTS.md` and `AGENT_GUARDRAILS.md`.
2. Read `.ai/WORK_QUEUE.md`. Reconcile its highest-priority candidates against current `main`, open PRs, CI, and referenced repo evidence before acting. Claim the task block before substantial mutation.
3. Load `.ai/authority.json` and `.ai/harness.json`.
4. Use `.ai/codebase-map.json` to find entry points, commands, configurations, high-risk surfaces, and known traps.
5. Run `node scripts/ai-harness/workspaces.mjs doctor --strict-current`. If isolation is needed, create it through `workspaces.mjs create`; do not invent an AppData/Local/Temp worktree path or a second clone.
6. If the task changes a stateful/runtime boundary — serverless/stateless work, server removal, persistence/session changes, background jobs, functions/queues/KV/object storage, or provider/runtime factoring — read and validate `.ai/stateful-surface-ledger.json` before choosing a workflow or editing application code.
7. Choose a workflow from `.ai/workflow-registry.json`. Stateful/runtime changes route to `axtask.stateful-architecture-migration.v1`; workspace isolation/lifecycle routes to `axtask.agent-workspace-lifecycle.v1`.
8. Create a run context matching `.ai/run-context.schema.json`.
9. Select validators from changed paths and workflow; do not confuse selection with execution.
10. Run the selected commands and record exact pass, fail, and skip results.
11. When a validator or workflow fails, route through `axtask.failure-recovery.v1` and produce the registered failure report.
12. Keep advancing the claimed queue item through validation, commit, push, PR/review repair, and merge whenever those actions are safe, authorized, and tool-accessible. `VERIFY`, `REVIEW`, and `MERGE` are continuation states, not handoff points.
13. Before stopping, classify any managed workspace `ACTIVE`, `PRESERVE`, or `REMOVE`, update the queue block with strongest proof, exact gate, and first executable next action, then produce the operator report and compressed handoff.

## Shared work queue

`.ai/WORK_QUEUE.md` is the single user-and-agent coordination ledger for unfinished work. It is deliberately a routing/index artifact rather than a second implementation specification: source, tests, runbooks, issues, PRs, and current runtime evidence remain the truth for each component.

A queue item may be marked `DONE` only when its acceptance gate is met and no safe actionable work remains inside its scope. Passing tests, committing, pushing, opening a PR, or obtaining green CI are not completion if the same agent can safely advance to the next checkpoint. Validate queue structure with:

```bash
node scripts/ai-harness/validate-work-queue.mjs
```

## Managed agent workspaces

Durable agent isolation is owned by `.ai/agent-workspace-contract.json`. The default managed root is a human-visible sibling of the current checkout: `<repo-name>-worktrees`. An operator may set `AXTASK_AGENT_WORKSPACE_ROOT` to another deliberate location. The primary checkout may live elsewhere; secondary agent worktrees may not.

Use the repo-owned helper:

```bash
node scripts/ai-harness/workspaces.mjs root
node scripts/ai-harness/workspaces.mjs doctor --strict-current
node scripts/ai-harness/workspaces.mjs create --task AXQ-000 --owner <agent> --branch <branch> --purpose "<purpose>" --base origin/main
node scripts/ai-harness/workspaces.mjs list
node scripts/ai-harness/workspaces.mjs doctor --strict-all
node scripts/ai-harness/workspaces.mjs classify --id <id> --status ACTIVE|PRESERVE|REMOVE
node scripts/ai-harness/workspaces.mjs cleanup --id <id>
```

The machine-local registry lives at `<managed-root>/.axtask-agent-workspaces.json` and is never tracked. `AppData/Local/Temp`, `os.tmpdir()`, `/tmp`, and `/var/tmp` are cache/scratch locations only: unique branch or sprint state must not live there. Agents must not create a second durable clone as an isolation shortcut.

Cleanup is deliberately fail-closed. `REMOVE` means “request cleanup,” not “safe to delete.” The helper removes only a secondary worktree that is clean and whose HEAD is already an ancestor of `origin/main`; it never force-removes and never deletes the branch. `doctor --strict-current` is hook-safe and protects the current agent without destructively cleaning unrelated legacy work. `doctor --strict-all` is the operator inventory for the whole Git-visible worktree set.

## Stateful architecture ledger

`.ai/stateful-surface-ledger.json` is the machine-validated decision contract for changes that alter state, process lifetime, persistence, scheduling, filesystem behavior, auth/session ownership, deployment runtime, queues/caches, or the harness/application seam. `docs/architecture/STATEFUL_SURFACE_LEDGER.md` is its human-readable companion.

The migration rules are fail-closed:

- Stateful does not mean bad; `KEEP` is a valid final decision.
- Provisional surfaces remain `keep` and cannot authorize application mutation.
- Use one approved migration seam per sprint.
- Do not choose a serverless provider before repository evidence proves the required runtime capabilities.
- Skills guide workflow, capabilities expose operations, triggers route deterministically, and application logic stays in code/domain contracts.
- Never promote static/build evidence to launcher/browser, behavior-observed, or live-runtime proof.

Validate this contract with:

```bash
node scripts/ai-harness/validate-stateful-architecture.mjs
```

## Canonical reference

```yaml
authorityRef: axtask.agent-authority.v1
```

Subordinate artifacts reference the authority identifier instead of copying repository law.

## Output policy

Ephemeral evidence belongs under `.ai/runs/`. Generated prompt artifacts belong under `.ai/generated/`. Both paths are ignored. Sanitized durable evidence belongs under `docs/releases/`.

The artifact registry records each artifact's producer, generation procedure, naming convention, tracking policy, and validator or template when applicable. Absolute personal paths and `.axtask-agent-workspaces.json` are machine-local evidence and must not be committed.

## Commands

```bash
node scripts/ai-harness/inspect-repo.mjs
node scripts/ai-harness/workspaces.mjs doctor --strict-current
node scripts/ai-harness/validate-agent-workspaces.mjs
node scripts/ai-harness/select-validators.mjs --context .ai/runs/<run-id>/context.json --output .ai/runs/<run-id>/validator-plan.json
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
node scripts/ai-harness/validate-work-queue.mjs
node scripts/ai-harness/validate-stateful-architecture.mjs
npx vitest run server/ai-harness/authority-contract.test.ts server/ai-harness/harness-contract.test.ts server/ai-harness/deployment-certification-contract.test.ts server/ai-harness/validator-selection-contract.test.ts server/ai-harness/harness-infrastructure-contract.test.ts server/ai-harness/work-queue-contract.test.ts server/ai-harness/stateful-architecture-contract.test.ts server/ai-harness/agent-workspace-contract.test.ts
```

The selector may also read repeated `--changed <path>` arguments, a newline-delimited `--changed-file`, or the current working-tree changes. It emits an English plan by default and never executes validator commands.

## Failure recovery

`validator-or-workflow-failed` deterministically routes to `.ai/workflows/failure-recovery.md`. Capture the smallest reproducible failure, classify ownership, avoid unchanged retries, rerun the failed gate first, and write `.ai/runs/<run-id>/failure-report.md`.

## Local hooks

Hooks are opt-in through:

```bash
node scripts/ai-harness/install-hooks.mjs
```

- `pre-commit` runs repository security guards plus authority, harness, work-queue, stateful-architecture, agent-workspace contract, strict-current workspace doctor, and artifact-hygiene validators.
- `pre-push` runs repository security guards, authority, harness completeness, work-queue, stateful-architecture, retention, agent-workspace contract, strict-current workspace doctor, and focused harness contract tests with `npx --no-install`.

The installer does not silently replace a different local hook path.
