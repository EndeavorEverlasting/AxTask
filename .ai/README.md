# AxTask repository AI harness

This directory is the machine-readable operating layer for repository agents. Prompts may be produced by workflows, but prompts are artifacts, not the harness.

## Start here

1. Read `AGENTS.md` and `AGENT_GUARDRAILS.md`.
2. Load `.ai/authority.json` and `.ai/harness.json`.
3. Use `.ai/codebase-map.json` to find entry points, commands, configurations, high-risk surfaces, and known traps.
4. Choose a workflow from `.ai/workflow-registry.json`.
5. Create a run context matching `.ai/run-context.schema.json`.
6. Select validators from changed paths and workflow; do not confuse selection with execution.
7. Run the selected commands and record exact pass, fail, and skip results.
8. When a validator or workflow fails, route through `axtask.failure-recovery.v1` and produce the registered failure report.
9. Produce the operator report and compressed handoff.

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
npx vitest run server/ai-harness/authority-contract.test.ts server/ai-harness/harness-contract.test.ts server/ai-harness/deployment-certification-contract.test.ts server/ai-harness/validator-selection-contract.test.ts server/ai-harness/harness-infrastructure-contract.test.ts
```

The selector may also read repeated `--changed <path>` arguments, a newline-delimited `--changed-file`, or the current working-tree changes. It emits an English plan by default and never executes validator commands.

## Failure recovery

`validator-or-workflow-failed` deterministically routes to `.ai/workflows/failure-recovery.md`. Capture the smallest reproducible failure, classify ownership, avoid unchanged retries, rerun the failed gate first, and write `.ai/runs/<run-id>/failure-report.md`.

## Local hooks

Hooks are opt-in through:

```bash
node scripts/ai-harness/install-hooks.mjs
```

- `pre-commit` runs repository security guards plus authority and harness validators.
- `pre-push` runs repository security guards, authority, harness completeness, and focused harness contract tests with `npx --no-install`.

The installer does not silently replace a different local hook path.
