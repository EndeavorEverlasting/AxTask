authorityRef: axtask.agent-authority.v1

# 30k domain — deployment-runtime

**Load when:** changing Render configuration, production startup, environment/readiness contracts, deploy gates, runtime certification, or predeploy cost/readiness. Do not infer live provider state from repository files.

## Responsibility and boundaries

- `render.yaml` is the Render blueprint; `scripts/production-start.mjs` owns production startup sequencing.
- `/health` is DB-free liveness; `/ready` is explicit DB readiness.
- Production startup must not run interactive Drizzle push by default.
- Live deploy/resume/provider mutation is a separate authorization/proof boundary.
- Cross-domain handoff: schema/recovery → `data-state`; auth/runtime secrets → `security-identity`.

## Demand-loaded owners

The machine-owned trigger → canonical-path table lives in `.ai/disclosure-map.json` and is appended by `show-context.mjs domain deployment-runtime`. Load only the matching runtime/deployment contract.

## Registered workflows

- `axtask.local-deployment-certification.v1` — disposable local production-mode proof only.
- `axtask.predeploy-cost-readiness.v1` — repository-only necessity/readiness/cost gate.

Load exactly one with `node scripts/ai-harness/show-context.mjs workflow <id>`. Use `.ai/codebase-map.json` only for deeper command/configuration discovery.
