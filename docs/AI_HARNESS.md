# AxTask repository AI harness

AxTask's repo-local harness is a control plane for repository agents. It is not a prompt collection.

## Components

- `AGENTS.md` and `AGENT_GUARDRAILS.md`: human-readable operating law
- `.ai/authority.json`: canonical precedence and stale-context rejection
- `.ai/harness.json`: component, workflow, skill, trigger, hook, and intelligence registry
- `.ai/codebase-map.json`: current roots, entry points, validation surfaces, and high-risk paths
- `.ai/workflow-registry.json`: canonical workflow inventory
- `.ai/workflows/`: repository intake, PR closeout, and local deployment certification procedures
- `.ai/run-context.schema.json`: required per-run boundaries, owner, environment class, and proof ceiling
- `.ai/runtime-proof.schema.json`: required shape for deployment and runtime evidence, including proof escalation rules
- `.ai/artifact-registry.json`: tracked versus ignored output policy and forbidden tracked outputs
- `.ai/validator-registry.json`: executable validation commands
- `.ai/capability-registry.json`: discoverable capabilities with availability status
- `.ai/trigger-registry.json`: deterministic trigger conditions and routing
- `.ai/ownership-rules.json`: single-owner policy for shared surfaces
- `.ai/skills/`: scoped, discoverable operating skills
- `scripts/ai-harness/inspect-repo.mjs`: read-only evidence snapshot
- `scripts/ai-harness/validate-run-context.mjs`: run-context schema validator
- `scripts/ai-harness/validate-runtime-proof.mjs`: runtime-proof schema validator
- `.ai/reports/` and `.ai/handoff/`: English operator report and compressed handoff contracts
- `.githooks/pre-commit`: optional local validator hook

## Fresh-agent path

```mermaid
flowchart TD
  A[Read AGENTS and guardrails] --> B[Load authority and harness manifests]
  B --> C[Inspect codebase map]
  C --> D[Choose workflow]
  D --> E[Create run context]
  E --> F[Execute bounded work]
  F --> G[Run registry validators]
  G --> H[Operator report]
  H --> I[Compressed handoff]
```

## Validation

```bash
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-run-context.mjs .ai/runs/<run-id>/context.json
node scripts/ai-harness/validate-runtime-proof.mjs .ai/runs/<run-id>/runtime-proof.json
npx vitest run server/ai-harness/authority-contract.test.ts server/ai-harness/harness-contract.test.ts server/ai-harness/deployment-certification-contract.test.ts
```

## Output policy

Run snapshots, generated prompts, and operator scratch reports are ignored under `.ai/runs/` and `.ai/generated/`. Only sanitized, durable evidence such as release notes is tracked.

## Hooks

Hooks are deliberately opt-in. Install locally with:

```bash
node scripts/ai-harness/install-hooks.mjs
```

The installer refuses to overwrite another local hook path unless `--force` is supplied.

## Proof ceiling

The harness can prove repository contract structure, validator behavior, and runtime-proof schema shape. It cannot prove that an external agent host followed the workflow, nor can it prove live Render or Neon state. A local runtime-proof artifact cannot claim live-runtime, deployment-completion, or operator-acceptance.
