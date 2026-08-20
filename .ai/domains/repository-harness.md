authorityRef: axtask.agent-authority.v1

# 30k domain — repository-harness

**Load when:** changing agent routing, harness/spec architecture, validators, token-budget measurement, work queue, repository-location recovery, workspaces, failure recovery, PR closeout, or parallel sprint coordination. Do not preload product/runtime domains.

## Responsibility and boundaries

- `AGENTS.md` = universal operating law; `AGENT_GUARDRAILS.md` = distinct safety boundaries.
- `.ai/README.md` = 50k orientation; `.ai/disclosure-map.json` = zoom routing/budgets.
- `.ai/tokenizer-registry.json` = tokenizer backend/profile identity. `huggingface/tokenizers` is the canonical general backend; AxTask context budgets use the exact `openai/tiktoken` `o200k_base` profile.
- `scripts/ai-harness/tokenizer.mjs` = reusable fail-closed token measurement contract; the Python backend dependency is pinned in `scripts/ai-harness/tokenizer-requirements.txt`.
- `.ai/codebase-map.json` = deeper path/command map, loaded only when needed.
- Registries own machine-readable identities/contracts; use `show-context.mjs` to slice records by ID instead of loading whole registries.
- `.ai/WORK_QUEUE.md` is shared unfinished-work coordination, loaded only to select/claim/update work.
- Reports, handoffs, releases, and `docs/closed/` are evidence/history, not default context.

## Registered workflows

- `axtask.repository-intake.v1`
- `axtask.pr-closeout.v1`
- `axtask.failure-recovery.v1`
- `axtask.repository-location-recovery.v1`
- `axtask.parallel-sprint-intake.v1`
- `axtask.prompt-leap-routing.v1`
- `axtask.agent-workspace-lifecycle.v1`

Load exactly one selected workflow with:

```bash
node scripts/ai-harness/show-context.mjs workflow <workflow-id>
```

## Validators and artifacts

Harness changes must run authority, harness, harness-infrastructure, progressive-disclosure, and selected focused validators/tests. Exact context-budget proof requires the pinned tokenizer runtime:

```bash
python -m pip install -r scripts/ai-harness/tokenizer-requirements.txt
node scripts/ai-harness/validate-progressive-disclosure.mjs
```

Generated evidence stays under ignored `.ai/runs/`; durable sanitized release evidence stays under `docs/releases/`.

If repository identity is uncertain, route to `axtask.repository-location-recovery.v1` before repository-relative mutation.
