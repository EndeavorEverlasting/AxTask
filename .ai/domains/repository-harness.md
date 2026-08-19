authorityRef: axtask.agent-authority.v1

# 30k domain — repository-harness

**Load when:** changing agent routing, harness/spec architecture, validators, work queue, repository-location recovery, workspaces, failure recovery, PR closeout, or parallel sprint coordination. Do not preload product/runtime domains.

## Responsibility and boundaries

- `AGENTS.md` = universal operating law; `AGENT_GUARDRAILS.md` = distinct safety boundaries.
- `.ai/README.md` = 50k orientation; `.ai/disclosure-map.json` = zoom routing/budgets.
- `.ai/codebase-map.json` = deeper path/command map, loaded only when needed.
- Registries own machine-readable identities/contracts; use `show-context.mjs` to slice records by ID instead of loading whole registries.
- `.ai/WORK_QUEUE.md` is shared unfinished-work coordination, loaded only to select/claim/update work.
- Reports, handoffs, releases, and `docs/closed/` are evidence/history, not default context.

## Registered workflows

Repository intake, PR closeout, failure recovery, repository-location recovery, parallel sprint intake, prompt-leap routing, and agent-workspace lifecycle are routed by `.ai/disclosure-map.json`. Execute:

```bash
node scripts/ai-harness/show-context.mjs workflow <workflow-id>
```

## Validators and artifacts

Harness changes must run authority, harness, harness-infrastructure, progressive-disclosure, and selected focused validators/tests. Generated evidence stays under ignored `.ai/runs/`; durable sanitized release evidence stays under `docs/releases/`.

If repository identity is uncertain, route to `axtask.repository-location-recovery.v1` before repository-relative mutation.
