authorityRef: axtask.agent-authority.v1

# AxTask repository AI harness — 50k orientation

AxTask is a task/planning application: React/Vite in the browser, Express/TypeScript on the server, and PostgreSQL/Drizzle for persistent data. The repository also contains deployment/operations tooling and a repo-local agent harness.

## Major domains

| Domain | Owns | Drill down |
|---|---|---|
| `application-experience` | client/server product behavior, UX, performance, module boundaries | `node scripts/ai-harness/show-context.mjs domain application-experience` |
| `security-identity` | auth, admin, privacy, user-content security, privileged grants | `node scripts/ai-harness/show-context.mjs domain security-identity` |
| `data-state` | schema, migrations, recovery, retention, persistence/stateful architecture | `node scripts/ai-harness/show-context.mjs domain data-state` |
| `deployment-runtime` | Render/runtime startup, readiness, environment, local certification, cost gates | `node scripts/ai-harness/show-context.mjs domain deployment-runtime` |
| `repository-harness` | agent routing, work queue, workspaces, validators, failure/PR closeout | `node scripts/ai-harness/show-context.mjs domain repository-harness` |

Canonical app entrypoints are `client/src/main.tsx`, `server/index.ts`, `shared/schema.ts`, `package.json`, and `render.yaml`. Do not open their large dependents until the selected domain requires them.

## Commands that matter first

```bash
node scripts/ai-harness/show-context.mjs orientation
node scripts/ai-harness/show-context.mjs domain <domain-id>
node scripts/ai-harness/show-context.mjs workflow <workflow-id>
node scripts/ai-harness/validate-progressive-disclosure.mjs
npm run check
npm test
npm run build
```

## Proof boundary

Current repository files, validators, and CI establish repository/CI proof only. They do **not** prove live Render state, Neon state, deployment, production migration, or operator acceptance.

## Load policy

This file is the default 50k context. Do **not** preload `.ai/WORK_QUEUE.md`, `.ai/harness.json`, `.ai/codebase-map.json`, whole registries, all workflows/skills, schemas, reports, release history, or implementation files.

Choose one domain next. Choose a workflow only when executing/changing that workflow. Before mutation, also read `AGENTS.md` and `AGENT_GUARDRAILS.md`; load the queue only to select/claim/update shared work. Routing, conditional loads, and soft budgets are machine-enforced by `.ai/disclosure-map.json`.
