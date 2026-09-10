authorityRef: axtask.agent-authority.v1

# AI Intent Offline Eval Gate

id: axtask.ai-intent-eval.v1

## Purpose

Run the versioned offline AI-intent eval pack against deterministic oracles and fixture LLM stubs. Fail closed on gating regressions versus the committed baseline. Do not spend live model tokens in CI.

## Trigger

`ai-intent-changed` — product intent parse/execute, eval fixtures, rubrics, or the eval runner change.

## Inputs

- Pack root: `evals/ai-intent/`
- Manifest: `evals/ai-intent/manifest.v1.json`
- Rubric: `evals/ai-intent/rubrics/v1.json`
- Baseline: `evals/ai-intent/baselines/v1/latest.json`
- Optional approval for intentional threshold/case changes: `evals/ai-intent/approvals/*.json`

## Command

```bash
npm run test:ai-eval
```

Write a fresh baseline only with explicit evidence:

```bash
npx tsx scripts/ai-eval/run-ai-intent-eval.mjs --write-baseline
```

Live model cases (non-CI) require `AXTASK_AI_EVAL_LIVE=1` and never weaken deterministic oracles.

## Outputs

- Untracked report: `.ai/runs/<run-id>/ai-intent-eval.json`
- Tracked baseline: `evals/ai-intent/baselines/v1/latest.json`

## Proof ceiling

Repository/CI proof covers rule_parser + fixture-provider behavior. It does not certify live OpenAI quality without an explicit live run and operator review.
