# Recovery queue and runbook floor after airlock merges — 2026-09-08

## Diagnosis

After PR #150 (startup recovery airlock) and PR #151 (Path C/D/E + Compose disposable-host parity) landed on `main`, the operational ledger still pointed operators at a pre-airlock floor:

- AXQ-007 / AXQ-005 last proof still cited the #148 / `cecb0e6` attestation;
- recovery runbook “next actions” still told Wave A to re-launch R7;
- R8 expected startup omitted `--production-startup` / `RECOVERY_ONLY_MIGRATION_PENDING`;
- `SCHEDULED_RESOURCE_CONTROLS.md` still taught unguarded `apply-migrations.mjs`.

That drift risks re-serializing completed local certification work and under-describing the fail-closed fuse before the real OPERATOR gates (R1/R3).

## Change

- Refresh `.ai/WORK_QUEUE.md` Wave A + AXQ-005/AXQ-007 proof tokens to the post-#151 floor (`merge:d7007ee…`, `workflow:34279160114`, `commit:9f7fe8f…`).
- Align `docs/DB_RECOVERY_RUNBOOK.md` R8 startup order and next-action list with the airlock.
- Align `docs/DB_RECOVERY_SUBPART_WAVE.md` Wave A R7 wording with AXQ-007 `DONE`.
- Document `--production-startup` in `docs/SCHEDULED_RESOURCE_CONTROLS.md`.
- Contract-test Path D/E airlock narrative in `server/deploy-schema-workflow.test.ts`.

## Non-goals

- No Render deploy, no production mutation, no R3/R1.5 execution.
- Does not authorize applying recovery migration `9999`.
- Does not change PR #139.

## Validation

```text
node scripts/ai-harness/validate-work-queue.mjs
npx vitest run server/ai-harness/work-queue-contract.test.ts server/deploy-schema-workflow.test.ts
node scripts/ai-harness/validate-recovery-wave.mjs
```
