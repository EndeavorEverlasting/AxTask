# Log-retention harness tests: isolated negative fixtures

## Diagnosis
Negative escape-hatch tests in `server/ai-harness/log-retention-harness-contract.test.ts` mutated live `.ai/*-registry.json` files (and related retention sources) in the checkout. Under Vitest file parallelism this raced `harness-infrastructure-contract.test.ts`, producing intermittent missing-path / wrong-command failures and leaving registry formatting dirty after restore.

## Change
Negative cases now copy the retention harness slice into a temp fixture root and mutate only that copy. Canonical registries are no longer written by these tests.

## Rollout
Repository test/harness change only. No production mutation. No Render/Neon action.

## Rollback
Revert the single test-file commit.

## Testing
- `npx vitest run server/ai-harness` — 140 passed
- Paired race: log-retention + harness-infrastructure ×3 — clean working tree
- `node scripts/ai-harness/validate-log-retention.mjs`
- `node scripts/ai-harness/validate-harness-infrastructure.mjs`
