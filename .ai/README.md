# AxTask repository AI harness

This directory is the machine-readable operating layer for repository agents. Prompts may be produced by workflows, but prompts are artifacts, not the harness.

## Start here

1. Read `AGENTS.md` and `AGENT_GUARDRAILS.md`.
2. Read `.ai/WORK_QUEUE.md`. Reconcile its highest-priority candidates against current `main`, open PRs, CI, and referenced repo evidence before acting. Claim the task block before substantial mutation.
3. Load `.ai/authority.json` and `.ai/harness.json`.
4. Use `.ai/codebase-map.json` to find entry points, commands, configurations, high-risk surfaces, and known traps.
5. Choose a workflow from `.ai/workflow-registry.json`.
6. Create a run context matching `.ai/run-context.schema.json`.
7. Select validators from changed paths and workflow; do not confuse selection with execution.
8. Run the selected commands and record exact pass, fail, and skip results.
9. When a validator or workflow fails, route through `axtask.failure-recovery.v1` and produce the registered failure report.
10. Keep advancing the claimed queue item through validation, commit, push, PR/review repair, and merge whenever those actions are safe, authorized, and tool-accessible. `VERIFY`, `REVIEW`, and `MERGE` are continuation states, not handoff points.
11. Before stopping, update the queue block with strongest proof, exact gate, and first executable next action; then produce the operator report and compressed handoff.

## Shared work queue

`.ai/WORK_QUEUE.md` is the single user-and-agent coordination ledger for unfinished work. It is deliberately a routing/index artifact rather than a second implementation specification: source, tests, runbooks, issues, PRs, and current runtime evidence remain the truth for each component.

A queue item may be marked `DONE` only when its acceptance gate is met and no safe actionable work remains inside its scope. Passing tests, committing, pushing, opening a PR, or obtaining green CI are not completion if the same agent can safely advance to the next checkpoint. Validate queue structure with:

```bash
node scripts/ai-harness/validate-work-queue.mjs
```

## Canonical reference

```yaml
authorityRef: axtask.agent-authority.v1
```

Subordinate artifacts reference the authority identifier instead of copying repository law.

## Output policy

Ephemeral evidence belongs under `.ai/runs/`. Generated prompt artifacts belong under `.ai/generated/`. Both paths are ignored. Sanitized durable evidence belongs under `docs/releases/`.

The artifact registry records each artifact's producer, generation procedure, naming convention, tracking policy, and validator or template when applicable.

## Commands

```bash
node scripts/ai-harness/inspect-repo.mjs
node scripts/ai-harness/select-validators.mjs --context .ai/runs/<run-id>/context.json --output .ai/runs/<run-id>/validator-plan.json
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-harness-infrastructure.mjs
node scripts/ai-harness/validate-work-queue.mjs
npx vitest run server/ai-harness/authority-contract.test.ts server/ai-harness/harness-contract.test.ts server/ai-harness/deployment-certification-contract.test.ts server/ai-harness/validator-selection-contract.test.ts server/ai-harness/harness-infrastructure-contract.test.ts server/ai-harness/work-queue-contract.test.ts
```

The selector may also read repeated `--changed <path>` arguments, a newline-delimited `--changed-file`, or the current working-tree changes. It emits an English plan by default and never executes validator commands.

## Failure recovery

`validator-or-workflow-failed` deterministically routes to `.ai/workflows/failure-recovery.md`. Capture the smallest reproducible failure, classify ownership, avoid unchanged retries, rerun the failed gate first, and write `.ai/runs/<run-id>/failure-report.md`.

## Local hooks

Hooks are opt-in through:

```bash
node scripts/ai-harness/install-hooks.mjs
```

- `pre-commit` runs repository security guards plus authority, harness, work-queue, and artifact-hygiene validators.
- `pre-push` runs repository security guards, authority, harness completeness, work-queue validation, and focused harness contract tests with `npx --no-install`.

The installer does not silently replace a different local hook path.
