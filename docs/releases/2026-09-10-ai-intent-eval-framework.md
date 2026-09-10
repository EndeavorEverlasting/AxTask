# Offline AI intent eval framework

## Diagnosis
`docs/AI_CAPABILITY_MATRIX.md` listed offline AI eval + CI quality gates as Missing. Product intent quality (rule_parser + LLM fallback + execute fail-closed) had unit tests but no versioned case pack, baseline, or fail-closed CI gate.

## Change
- Added `evals/ai-intent/` pack (manifest, rubric, 16 gating cases including hallucination diagnosis pairs, committed baseline).
- Added `server/ai-eval/` deterministic scorers, fixture LLM provider, pack runner, and contract tests.
- Added `scripts/ai-eval/` CLI + baseline compare and harness validator `ai-intent-eval`.
- Wired `npm run test:ai-eval`, validator/artifact/workflow registries, and CI step in `test-and-attest.yml`.

## Rollout
Repository test/harness change only. No production mutation. No live OpenAI spend in CI.

## Rollback
Revert the commit that introduced `evals/ai-intent/`, `server/ai-eval/`, `scripts/ai-eval/`, and the registry/CI wiring.

## Testing
- `npm run test:ai-eval` — 16/16 gating pass, baseline compare OK
- `npx vitest run server/ai-eval server/ai-harness/ai-intent-eval-harness-contract.test.ts`
