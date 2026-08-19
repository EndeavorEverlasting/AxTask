authorityRef: axtask.agent-authority.v1

# 30k domain — application-experience

**Load when:** changing user-visible task/planner/calendar/community/reward behavior, client/server feature behavior, or performance-sensitive product code. Do not load security, database, deployment, or harness detail unless the change crosses that boundary.

## Responsibility and boundaries

- Browser root: `client/src`; server/API behavior: `server`; shared public types/contracts: `shared`.
- Canonical entrypoints: `client/src/main.tsx`, `server/index.ts`, `shared/schema.ts`.
- Preserve existing product behavior while factoring structure; physical module splits follow `docs/MODULE_LAYOUT.md`.
- Cross-domain handoff: auth/privacy/user-content security → `security-identity`; schema/persistence → `data-state`; startup/runtime → `deployment-runtime`.

## Demand-loaded owners

The machine-owned trigger → canonical-path table lives in `.ai/disclosure-map.json` and is appended by `show-context.mjs domain application-experience`. Load only the owner whose trigger matches; do not read the whole documentation set.

## Inputs, outputs, proof

Inputs are the selected feature contract plus current source/tests. Outputs are bounded code/tests and, when required, release evidence. Use `.ai/codebase-map.json` only for deeper path/command discovery. Validator selection comes from `.ai/validator-registry.json`; execute selected validators rather than loading the whole registry into context.
