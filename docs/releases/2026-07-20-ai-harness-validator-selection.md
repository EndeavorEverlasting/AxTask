# AI harness validator selection

Date: 2026-07-20

## Diagnosis

The repo-local harness exposed a validator registry, but the `validator-selection` capability remained planned. A fresh agent could discover commands but had no deterministic, repository-owned method to choose a targeted set from changed paths and the selected workflow. That gap encouraged either running every command indiscriminately or inventing ad hoc validation rules outside the harness.

## Change

- Added `scripts/ai-harness/select-validators.mjs`.
- Added changed-path, workflow, dependency, and fallback metadata to `.ai/validator-registry.json`.
- Added the deployment-contract validator already exposed by `npm run test:deploy`.
- Promoted `validator-selection` from planned to available in `.ai/capability-registry.json`.
- Registered `.ai/runs/<run-id>/validator-plan.json` as an ignored harness artifact.
- Updated repository-intake workflow, skill, harness entry point, and operator documentation.
- Added `server/ai-harness/validator-selection-contract.test.ts` for harness, deployment, docs-only, workflow, Windows-path, output-boundary, and unknown-dependency behavior.

## Behavior

The selector accepts explicit changed paths, a changed-path file, a run context, or current working-tree paths. It prints an English plan by default, supports JSON output, expands validator dependencies, and never executes commands. Unmapped paths receive the conservative fallback of release check, typecheck, full tests, and production build.

A written validator plan is permitted only below `.ai/runs/`, which is already ignored. Selection is evidence of planning, not evidence that validation ran.

## Scope

Only harness manifests, workflow and skill documentation, harness tooling, harness tests, and this release note. No product code, dependencies, lockfiles, deployment configuration, schema, migrations, authentication, or live systems.

## Validation

```bash
node scripts/ai-harness/select-validators.mjs --changed .ai/validator-registry.json
node scripts/ai-harness/select-validators.mjs --changed render.yaml --json
node scripts/ai-harness/validate-authority.mjs
node scripts/ai-harness/validate-harness.mjs
npx vitest run server/ai-harness/authority-contract.test.ts server/ai-harness/harness-contract.test.ts server/ai-harness/deployment-certification-contract.test.ts server/ai-harness/validator-selection-contract.test.ts
npm run release:check
npm run check
npm test
npm run build
```

## Rollout

Merge after current-head CI passes. Fresh agents should create their run context, generate a validator plan, review it, then execute and record each selected command.

## Rollback

Revert the selector, registry metadata, and documentation together. The prior validator commands remain valid but would again require manual selection.

## Proof ceiling

Repository contract, static-test, build, and CI proof only. This change does not prove that an external agent executed selected validators, and it does not provide local, staging, live, deployment, or operator-acceptance proof.
