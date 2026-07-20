# Deployment certification spine

Date: 2026-07-20

## Diagnosis

The repository harness from PR #80 gives agents intake, closeout, and maintenance paths, but deployment recovery requires canonical contracts for run boundaries, runtime evidence, capability/trigger ownership, and proof escalation. Without these, agents could invent runtime-proof artifacts or claim live deployment from local tests.

## Change

Added the deployment certification spine to the AI harness:

- `.ai/capability-registry.json` with repository inspection, PR collision inspection, validator selection, deployment candidate assembly, local production certification, and runtime-proof recording.
- `.ai/trigger-registry.json` with deterministic conditions including deployment-sensitive paths, local certification request, candidate green, missing runtime proof, and unauthorized live mutation.
- `.ai/workflow-registry.json` with canonical workflow inventory.
- `.ai/ownership-rules.json` assigning single owners to `.ai/**`, `render.yaml`, `scripts/production-start.mjs`, `scripts/deploy/**`, `scripts/db/**`, `migrations/**`, `package.json`, and `tests/deploy/**`.
- Extended `.ai/run-context.schema.json` with owner role, activation reason, environment class, candidate SHA, selected skills/capabilities/triggers, preconditions, forbidden conditions, likely and collision files, targeted validators, required and attained proof levels.
- `.ai/runtime-proof.schema.json` with candidate SHA, environment class, commands, timestamps, sanitized artifacts, assertions, failures, skipped evidence, proof levels, and operator acceptance; includes proof escalation rules that make local/staging claims of live/deployment/operator proof structurally invalid.
- `.ai/workflows/local-deployment-certification.md` for disposable local production certification.
- `.ai/skills/runtime-proof.md` for truthful runtime-proof handling.
- `scripts/ai-harness/validate-run-context.mjs` and `scripts/ai-harness/validate-runtime-proof.mjs`.
- `server/ai-harness/deployment-certification-contract.test.ts` with negative tests for missing owner, duplicate capability/trigger IDs, unknown workflow triggers, deployment claims without ID, local proof claiming live proof, and forbidden tracked outputs.
- Updated `.ai/harness.json`, `.ai/artifact-registry.json`, `.ai/validator-registry.json`, and `docs/AI_HARNESS.md` to reference the new registries and validators.
- One ignored sample run under `.ai/runs/p07-sample/`.

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

Merge after current-head checks pass. P08 deployment candidate repair and P09 local production certification may then reference these contracts without inventing their own output shapes.

## Rollback

Revert if the new registries, schemas, or validators block the existing intake/closeout/maintenance paths. Do not revert because downstream sprints have not yet executed; those sprints depend on these contracts.

## Proof ceiling

Contract, harness, and static-test proof. No live Render, Neon, deployment, or operator acceptance claimed.
