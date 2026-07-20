# Deployment certification spine

Date: 2026-07-20

## Diagnosis

The repository harness from PR #80 gives agents intake, closeout, and maintenance paths, but deployment recovery requires canonical contracts for run boundaries, runtime evidence, capability and trigger ownership, and proof escalation. Without these, agents could advertise nonexistent operations, invent runtime-proof artifacts, or claim live deployment from local tests.

## Change

Added and hardened the deployment certification spine:

- `.ai/capability-registry.json` is the canonical capability inventory. Only commands that exist are marked `available`; collision inspection, validator selection, candidate assembly, and local certification remain explicitly `planned` until their executables land.
- `.ai/trigger-registry.json` is the canonical trigger owner for deployment-sensitive paths, local certification requests, current green candidates, missing runtime proof, and unauthorized live mutation.
- `.ai/workflow-registry.json` is the canonical workflow inventory. Workflow and trigger routes are referenced rather than copied into `.ai/harness.json`.
- `.ai/ownership-rules.json` assigns single owners to `.ai/**`, `render.yaml`, `scripts/production-start.mjs`, `scripts/deploy/**`, `scripts/db/**`, `migrations/**`, `package.json`, and `tests/deploy/**`.
- `.ai/run-context.schema.json` records owner role, activation reason, environment class, candidate SHA, selected skills, capabilities, triggers, preconditions, forbidden conditions, likely and collision files, targeted validators, and required and attained proof levels.
- `.ai/runtime-proof.schema.json` defines local-runtime, staging-runtime, live-runtime, deployment-completion, and operator-acceptance boundaries, plus live deployment ID, timestamp, and observed-endpoint fields.
- `.ai/workflows/local-deployment-certification.md` and `.ai/skills/runtime-proof.md` define disposable certification guidance and truthful evidence handling.
- `scripts/ai-harness/validate-run-context.mjs` validates required types, registry references, proof levels, and environment ceilings.
- `scripts/ai-harness/validate-runtime-proof.mjs` validates evidence structure, passed assertions, unresolved failures, environment ceilings, live identifiers, and operator-acceptance consistency.
- `scripts/ai-harness/validate-harness.mjs` rejects duplicate registry IDs, ambiguous or unknown trigger routes, false available capabilities, missing capability metadata, and missing live-proof property definitions.
- `server/ai-harness/deployment-certification-contract.test.ts` injects malformed contexts, duplicate IDs, invalid routes, inflated ceilings, missing deployment evidence, and failed runtime assertions to prove rejection behavior.
- `.ai/artifact-registry.json` forbids tracked raw logs, database dumps, credentials, heap snapshots, Playwright output, and `.ai/runs/` content.
- One valid sample run remains ignored under `.ai/runs/p07-sample/`.

## Scope

Only harness files, harness validators, harness tests, and harness documentation. No changes to `render.yaml`, `package.json`, migrations, schema, product code, authentication, routing, UI, or live services.

## Validation

```bash
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
node scripts/ai-harness/validate-run-context.mjs .ai/runs/p07-sample/context.json
node scripts/ai-harness/validate-runtime-proof.mjs .ai/runs/p07-sample/runtime-proof.json
npx vitest run server/ai-harness/authority-contract.test.ts server/ai-harness/harness-contract.test.ts server/ai-harness/deployment-certification-contract.test.ts
npm run release:check
npm run check
npm test
npm run build
```

## Rollout

Merge only after all required checks pass on the current head. P08 deployment candidate repair and P09 local production certification may then reference these contracts without inventing output shapes or proof levels.

## Rollback

Revert if the new registries, schemas, or validators block the existing intake, closeout, or maintenance paths. Do not weaken proof boundaries because downstream capabilities are not yet implemented.

## Proof ceiling

Contract, harness, static-test, build, and CI proof only. No local production runtime, staging runtime, live Render, Neon, deployment completion, or operator acceptance is claimed.
