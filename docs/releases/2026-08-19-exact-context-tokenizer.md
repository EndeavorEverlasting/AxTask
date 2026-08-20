# Exact context tokenizer harness — 2026-08-19

## Scope

Repository-harness context measurement only. This change does not alter AxTask product behavior, production hosting, database state, authentication, or live provider configuration.

## Contract

- `.ai/tokenizer-registry.json` is the machine-readable tokenizer identity and routing contract.
- `huggingface/tokenizers` is the canonical general-purpose tokenizer backend for future cross-application adapters because its upstream implementation is Rust-first with Python and Node bindings.
- AxTask progressive-disclosure budgets use `openai/tiktoken` through profile `openai-o200k` because the budget is measuring OpenAI-family context usage. The active encoding is `o200k_base`.
- The OpenAI backend is pinned to `tiktoken==0.14.0` in `scripts/ai-harness/tokenizer-requirements.txt` and executed through the fail-closed stdin/stdout adapter `scripts/ai-harness/tiktoken-backend.py`.
- `scripts/ai-harness/tokenizer.mjs` is the reusable application-facing contract. It verifies repository containment, registry/backend/profile identity, backend version, exact integer token output, and never falls back silently to a byte heuristic.

## Migration

Before this change, `show-context.mjs` and `validate-progressive-disclosure.mjs` approximated context cost as `ceil(UTF-8 bytes / 4)`. That approximation remains recognizable through the compatibility field `estimatedTokens`, but the value is now an alias of the exact tokenizer count and every measurement carries `measurement: exact-tokenization`, backend identity, version, profile, and encoding.

The 50k/30k/15k ceilings remain unchanged at 1,000 / 2,000 / 4,000 tokens. CI installs the pinned backend before the progressive-disclosure contract and before the repository-wide test lane, so the owning validator fails closed if exact tokenization cannot run.

## Rollout

1. Install the pinned backend with `python -m pip install -r scripts/ai-harness/tokenizer-requirements.txt`.
2. Run `node scripts/ai-harness/validate-progressive-disclosure.mjs`.
3. Run representative `show-context.mjs ... --measure` queries and the focused Vitest contract.
4. Require the dedicated progressive-disclosure workflow and repository-wide `test-and-attest` workflow to pass before merge.

No production rollout is required; this is repository/CI tooling only.

## Rollback

Revert the tokenizer registry/adapter changes and restore the previous `utf8-bytes-divided-by-four` estimator contract in `.ai/disclosure-map.json`, `show-context.mjs`, and `validate-progressive-disclosure.mjs`. Do not remove the exact backend while any disclosure validator still declares `exact-tokenizer`; that mismatch is intentionally fail-closed.

## Proof ceiling

Repository and CI proof only. Exact token counts prove the selected `o200k_base` encoding for the rendered repository text; they do not prove the full request envelope of any hosted chat product, hidden system context, provider billing, or live application deployment.

## First exact measurement

```bash
python -m pip install -r scripts/ai-harness/tokenizer-requirements.txt
node scripts/ai-harness/show-context.mjs orientation --measure
```
