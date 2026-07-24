# Cross-Surface Contract Impact Spine

Date: 2026-07-23

## Diagnosis

When canonical contract files (e.g. `render.yaml`) changed, validator selection matched only direct paths and lacked dependency awareness of derivative active documentation surfaces (e.g. `docs/DEPLOYMENT_TEST_SUITE.md`). This allowed changes to pass CI even if active operator documentation retained stale claims (such as `healthCheckPath: /ready`).

## Change

- Created `.ai/contract-impact-registry.json` mapping canonical source contract files to active dependent surfaces, owning lanes, and required validators.
- Created read-only inspector `scripts/ai-harness/inspect-contract-impact.mjs` to discover contract impact domains and output sanitized results under `.ai/runs/`.
- Integrated contract impact discovery into `scripts/ai-harness/select-validators.mjs` so changed canonical source paths automatically select dependent validators (such as `deploy` and `docs-contracts`).
- Registered `contract-impact-registry` and `contract-impact-inspector` in `.ai/harness.json`, `.ai/artifact-registry.json`, and `.ai/validator-registry.json`.
- Added contract tests in `server/ai-harness/contract-impact-contract.test.ts`.

## Scope

- `.ai/contract-impact-registry.json`
- `.ai/artifact-registry.json`
- `.ai/validator-registry.json`
- `.ai/harness.json`
- `scripts/ai-harness/inspect-contract-impact.mjs`
- `scripts/ai-harness/select-validators.mjs`
- `server/ai-harness/contract-impact-contract.test.ts`
- `docs/AI_HARNESS.md`
- this release note

## Validation

- `node scripts/ai-harness/inspect-contract-impact.mjs --changed render.yaml --json` PASSED
- `node scripts/ai-harness/select-validators.mjs --changed render.yaml --json` PASSED (selected `deploy` and `docs-contracts`)
- `node scripts/ai-harness/validate-authority.mjs` PASSED
- `node scripts/ai-harness/validate-harness.mjs` PASSED
- `npx vitest run server/ai-harness/contract-impact-contract.test.ts` PASSED
- `node scripts/release-check.mjs` PASSED
