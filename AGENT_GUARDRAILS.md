# Agent guardrails

Read `AGENTS.md` and this file before changing AxTask.

These rules define safety boundaries. They do not make high-risk files permanently untouchable, and they do not override current repository evidence.

## 1. Authority order

When instructions disagree, use this order:

1. Current repository state and executable contracts, including `render.yaml`, `package.json`, startup scripts, migrations, tests, and CI.
2. `AGENTS.md` as the current human entry point.
3. This file for distinct safety boundaries.
4. Feature and architecture documents, including `replit.md`, which may contain historical platform context.
5. Old plans, stale PR descriptions, and unmerged branches.

Never treat remembered chat context or a platform-specific filename as stronger than current `main`.

## 2. Production domains

AxTask uses externally managed production domains:

- `axtask.app`
- `axtask.dev`

Do not change DNS, domain routing, redirect domains, cookie domains, or canonical-host settings unless the sprint explicitly owns the complete domain migration and includes rollout and rollback evidence.

A historical Replit hostname in the repository does not establish the current hosting provider. The known `axtask.replit.app` reference in `server/index.ts` belongs to a separate bounded domain-migration task.

## 3. Current deployment authority

Current deployment authority is:

- `render.yaml`
- `docs/GIT_BRANCHING_AND_DEPLOYMENT.md`
- `scripts/production-start.mjs`
- deploy contracts under `tests/deploy/`

The current production path targets Render. Replit compatibility files and Replit OIDC support do not mean Replit is the active production host.

Deployment requirements:

- Use a feature branch and PR.
- Do not push experimental work directly to the production-connected branch.
- Preserve startup ordering: environment checks, database-capacity checks, deterministic SQL migrations, guarded Drizzle policy, then server start.
- Production startup must not run live `drizzle-kit push` by default.
- `/health` is DB-free process liveness.
- `/ready` is explicit database readiness and may query PostgreSQL. Do not use it as routine liveness.
- Deploy, startup, Render, environment, schema, or migration PRs need diagnosis, tests, rollout, rollback, and an honest proof ceiling.

Do not claim a deployment occurred without a deployment identifier, deployed SHA, timestamp, and live evidence.

## 4. Database and schema safety

AxTask uses PostgreSQL through `DATABASE_URL`; current production recovery and cost controls target Neon.

- Never run destructive table or production-data operations without explicit authorization and a bounded maintenance plan.
- Never print or commit database connection values.
- Use reviewed, ordered SQL migrations under `migrations/` for production schema evolution.
- Use `scripts/apply-migrations.mjs` and its migration ledger for deterministic deployment changes.
- Run Drizzle push only from an intentional interactive operator context where the proposed changes can be reviewed.
- Do not restore runtime schema discovery or automatic production schema mutation.
- Preserve migration `9999_disable_api_request_security_events.sql` and the application-side request-logging gate.
- New append-only tables require retention policy and cleanup coverage in the same PR.

CI schema proof is not production migration proof.

## 5. Scheduled resource safety

Production scheduled work is off unless it has earned its cost. Follow `docs/SCHEDULED_RESOURCE_CONTROLS.md`.

Do not re-enable reminder dispatch, archetype rollups, DB-size snapshots, ops snapshots, backup workers, or other recurring database work without:

- an explicit feature need;
- a documented interval and resource estimate;
- bounded telemetry;
- a rollback switch;
- a post-deploy observation window.

Do not enable disabled workers merely to manufacture diagnostic samples.

## 6. Authentication boundary

AxTask supports multiple application authentication providers. Provider support is an application capability, not hosting evidence.

Changes to authentication, sessions, MFA, browser-visible user serialization, or admin step-up behavior require a dedicated sprint and their existing security contracts. Do not mix those changes into deployment or documentation cleanup.

## 7. High-risk surfaces

These files are not permanently forbidden. They require explicit ownership, repository evidence, targeted tests, and rollback notes:

| Surface | Required discipline |
|---|---|
| `render.yaml` | Deployment contract and runtime-cost impact |
| `scripts/production-start.mjs` | Startup ordering and fail-closed proof |
| migration and Drizzle scripts | Ordering and interactive-policy proof |
| `migrations/`, `shared/schema.ts`, `drizzle.config.ts` | Additive schema, greenfield, idempotence, and rollback proof |
| `package.json`, lockfiles, workflows | Build, dependency, and CI compatibility |
| `.replit` and Replit-specific files | Legacy/local compatibility only; never infer production authority |
| auth, session, MFA, and admin middleware | Dedicated security and authorization proof |
| `vite.config.ts`, `server/vite.ts` | Local/build serving contracts |

If a sprint does not own a required high-risk surface, use a separate follow-up instead of hiding it in an unrelated PR.

## 8. Allowed work

Within a clearly owned sprint, agents may modify code, tests, documentation, scripts, configuration, schemas, migrations, or CI. The standard is whether the change is bounded, evidence-based, validated, and honest about its proof ceiling.

Agents must preserve unrelated work, reuse repository patterns, add enforcement tests where practical, and avoid committing raw runtime evidence or machine-local artifacts.

## 9. Before high-risk changes

1. Confirm repository root, branch, HEAD, worktree state, and PR base.
2. Read `AGENTS.md`, this file, and the relevant canonical document.
3. Inspect current code, tests, recent commits, and open PR collision surfaces.
4. State owned and forbidden scope.
5. Run targeted contracts before broader checks.
6. Include rollout, rollback, and proof ceiling in the PR.
7. Do not infer live success from repository or CI evidence alone.
8. **Fail-closed operator blocks.** When later commands depend on prerequisite proof such as repository identity/version, credential presence, target separation, storage, capacity, or provider state, validate all prerequisites first. On failure, end that operator action. Do not place dependent commands after a fallible gate in the same interactive paste unless the whole block is structurally unable to continue after failure.
