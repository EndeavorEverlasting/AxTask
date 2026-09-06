# Bind recovery ledger to attested main and fail-close R3≠R5 naming

## Diagnosis

Current `main` is `cecb0e6c0f2637592bbae203560a4568aaeef63b`, whose parent is PR #148 merge `69818369c2e9635decd79c658af352e3ecb306ec`. Post-merge GitHub Actions run `34050440866` on that merge is green, including local production certification and Docker build. The canonical work queue still cited the older R7 proof `workflow:34044694367` / `merge:b4d3bdac…`. Agent handoff wording also risked calling R3 a "reclaim path"; R3 is backup and rollback proof, and physical reclaim is R5.

## Change

- `.ai/WORK_QUEUE.md` now records the attested R7/R8 floor on `workflow:34050440866` / `merge:69818369…` / `commit:cecb0e6c…`.
- R3 queue, runbook, and sub-part wave text now say R3 is backup/rollback proof, not physical reclaim.
- `validate-recovery-wave.mjs` fails closed if AXQ-003 Scope or Next action describes R3 as reclaim, if AXQ-003 Forbidden drops reclaim, or if the R3 runbook command fences include reclaim operations.

## Rollout

Repository coordination/contract change only. No production mutation. No Render/Neon action. Deployment authorization remains NO.

## Rollback

Revert this commit.

## Testing

- `node scripts/ai-harness/validate-work-queue.mjs`
- `node scripts/ai-harness/validate-recovery-wave.mjs`
- `npx vitest run server/ai-harness/work-queue-contract.test.ts server/ai-harness/recovery-wave-contract.test.ts`
- `npm run release:check`
