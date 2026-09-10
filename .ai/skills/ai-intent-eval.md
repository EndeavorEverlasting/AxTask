# Skill: AI intent offline eval

authorityRef: axtask.agent-authority.v1
skillId: axtask.skill.ai-intent-eval.v1

## Trigger conditions

Use when changing product NL intent parse/execute (`server/ai/**`), eval fixtures under `evals/ai-intent/`, scorers/runner under `server/ai-eval/` or `scripts/ai-eval/`, or the CI/harness gate for AI quality.

## Required inputs

- current repository SHA;
- `evals/ai-intent/manifest.v1.json`;
- `evals/ai-intent/baselines/v1/latest.json`;
- `docs/AI_CAPABILITY_MATRIX.md` evaluation section.

## Procedure

1. Run `npm run test:ai-eval` (or `node scripts/ai-harness/validate-ai-intent-eval.mjs`).
2. Keep gating cases fail-closed; never delete or weaken a case only to green a candidate.
3. Threshold or intentional case changes require `evals/ai-intent/approvals/*.json` evidence plus `--write-baseline` with a clear note.
4. Do not enable `AXTASK_AI_EVAL_LIVE=1` in CI. Live model proof is operator-authorized and separate from the repository gate.
5. Write sanitized reports under `.ai/runs/<run-id>/ai-intent-eval.json`; never track raw provider transcripts or secrets.

## Expected outputs

- PASS/FAIL from the offline eval gate;
- updated baseline only when intentionally approved;
- release note when shipping pack/wiring changes.
