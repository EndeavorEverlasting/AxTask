# AxTask repository AI harness

This directory is the machine-readable operating layer for repository agents. Prompts may be produced by workflows, but prompts are artifacts, not the harness.

## Start here

1. Read `AGENTS.md` and `AGENT_GUARDRAILS.md`.
2. Load `.ai/authority.json` and `.ai/harness.json`.
3. Use `.ai/codebase-map.json` to find the owned surface.
4. Choose a workflow from `.ai/workflow-registry.json`.
5. Create a run context matching `.ai/run-context.schema.json`.
6. Select validators from changed paths and workflow; do not confuse selection with execution.
7. Run the selected commands and record results in the run context.
8. Produce the operator report and compressed handoff.

## Canonical reference

```yaml
authorityRef: axtask.agent-authority.v1
```

Subordinate artifacts reference the authority identifier instead of copying repository law.

## Output policy

Ephemeral evidence belongs under `.ai/runs/`. Generated prompt artifacts belong under `.ai/generated/`. Both paths are ignored. Sanitized durable evidence belongs under `docs/releases/`.

## Commands

```bash
node scripts/ai-harness/inspect-repo.mjs
node scripts/ai-harness/select-validators.mjs --context .ai/runs/<run-id>/context.json --output .ai/runs/<run-id>/validator-plan.json
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
npx vitest run server/ai-harness/authority-contract.test.ts server/ai-harness/harness-contract.test.ts server/ai-harness/deployment-certification-contract.test.ts server/ai-harness/validator-selection-contract.test.ts
```

The selector may also read repeated `--changed <path>` arguments, a newline-delimited `--changed-file`, or the current working-tree changes. It emits an English plan by default and never executes validator commands.

Local hooks are opt-in through `node scripts/ai-harness/install-hooks.mjs`. The installer does not silently replace a different local hook path.
