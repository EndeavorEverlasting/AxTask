# AxTask AI intent eval pack (`axtask.ai-intent.v1`)

Offline, fail-closed fixtures for the product NL → `interpretIntent` path (rule parser → fixture LLM → optional execute probe).

## Run

```bash
npm run test:ai-eval
```

Optional live-model cases (`layer: live_optional`) stay skipped unless `AXTASK_AI_EVAL_LIVE=1`. CI must not supply live provider keys for this gate.

## Fail-closed policy

- All `gating: true` cases must pass (`manifest.threshold.minGatingPassRate` = 1.0, `maxGatingFailures` = 0).
- Candidate scores compare to `baselines/v1/latest.json`; regressions exit non-zero.
- Weakening a gating case or threshold requires a committed approval under `approvals/` (reason, owner, old/new hashes). No silent case deletion.
- Populate / refresh the baseline only via the runner’s explicit `--write-baseline` flag.

## Layout

| Path | Role |
|------|------|
| `manifest.v1.json` | Pack index, threshold, case ids |
| `rubrics/v1.json` | Correctness (gating) vs style (weight 0) criteria |
| `cases/v1/*.json` | Deterministic oracles + hallucination diagnosis pairs |
| `baselines/v1/latest.json` | Committed golden scoreboard |
| `approvals/` | Threshold / case-weakening evidence |
