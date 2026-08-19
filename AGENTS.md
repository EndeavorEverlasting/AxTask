# Agent notes (AxTask)

## Canonical operating authority

Use current repository evidence before historical platform notes. Read [AGENT_GUARDRAILS.md](AGENT_GUARDRAILS.md) before high-risk or mutating work, then follow executable contracts in `render.yaml`, `package.json`, startup and migration scripts, tests, and CI.

Current production deployment work is Render-oriented and current database recovery/cost work is Neon-oriented. Replit compatibility files and Replit OIDC support do not establish the active production host. `replit.md` is an architecture snapshot, not deployment authority.

When instructions disagree, current `main` and executable contracts win. Do not infer live deployment or database state from repository or CI evidence.

The machine-readable authority reference is [`.ai/authority.json`](.ai/authority.json). Every subordinate harness artifact declares `authorityRef: axtask.agent-authority.v1` rather than restating repository law. Fresh agents start at the compact [`.ai/README.md`](.ai/README.md) orientation router. [`.ai/harness.json`](.ai/harness.json) remains the component registry and is demand-loaded when harness structure is being changed; drill down with `node scripts/ai-harness/show-context.mjs domain <id>` and `node scripts/ai-harness/show-context.mjs workflow <id>`.

## Universal operating law

- Preserve unknown dirty work. Use the repository-owned workspace lifecycle when isolation is required; never use reset, clean, force, or a second durable clone as a shortcut.
- Own the sprint explicitly. High-risk files are editable only when the sprint owns them and has targeted validation, rollback notes, and an honest proof ceiling.
- Never commit credentials, database URLs, raw production logs, database dumps, personal machine paths, or generated `.ai/runs/` / `.ai/generated/` evidence.
- Production-affecting work uses a feature branch and PR. Do not push experiments directly to the production-connected branch.
- Repository tests and CI prove repository behavior only. Live Render, Neon, deployment, migration, and operator acceptance require their own runtime evidence.
- Fail closed when prerequisite proof is missing. Do not chain dependent operator actions after a failed repository, credential, target, storage, capacity, or provider gate.
- Prompts orchestrate work; deterministic product behavior belongs in code, schemas, registries, tests, or validators.

## Progressive disclosure

Do not preload every domain rule, skill, workflow, schema, report, historical handoff, or implementation file.

1. **50k orientation:** read `.ai/README.md` only.
2. **30k domain:** select one domain with `node scripts/ai-harness/show-context.mjs domain <id>`.
3. **15k workflow:** select one workflow with `node scripts/ai-harness/show-context.mjs workflow <id>`.
4. Before mutation, load this file plus `AGENT_GUARDRAILS.md`; then load only the extra canonical documents named by the selected domain/workflow and changed paths.
5. Load `.ai/WORK_QUEUE.md` only when selecting, claiming, or updating shared unfinished work. Load history (`docs/releases/`, `docs/closed/`, old PR bodies) only when the active task needs evidence from it.

The machine-readable routing and context budgets live in `.ai/disclosure-map.json`. Validate changes with `node scripts/ai-harness/validate-progressive-disclosure.mjs`.

## Git, validation, and completion

For deployable/reviewable work, commit and push the feature branch as part of the same deliverable. `npm run ship -- "<conventional message>"` is the preferred local path when the checkout is available. Do not bypass feature-branch + PR policy.

Select validators from changed paths and the active workflow, execute them, record pass/fail/skip evidence, and route failures through `axtask.failure-recovery.v1`. A selected validator is not proof until it ran.

Closed feature plans belong in `docs/closed/` with `CLOSED` status so active intake does not keep parsing them.

Before stopping, report the exact commit/PR state, strongest attained proof, gaps, preserved work, and the first executable next action. `VERIFY`, `REVIEW`, and `MERGE` are continuation states when safe authorized work remains.
