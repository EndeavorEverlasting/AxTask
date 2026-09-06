# Recovery-aware predeploy readiness — 2026-09-06

## Current floor

- Repository: `EndeavorEverlasting/AxTask`
- Default branch: `main`
- Current tip at sprint start: `de5dd317ba67320600e5b8428a65565b9077daf0`
- PR #146 merge: `b4d3bdac13e73cb6458b630e0d4dec69fbd4990c`
- PR #146 feature head: `4a346ab8e8778ab7a96ef62bc5278564921dbc43`
- Post-merge CI run: `34044694367`
- Open PR #139 is intentionally outside this sprint and remains untouched.

The current recovery runbook already records the production 503 blocker as a database-capacity startup failure: approximately 36.20 GB total database size, approximately 36.19 GB in `public.security_events`, and a configured 10.00 GB operator capacity budget that hard-failed startup. Exact production `security_events.event_type` composition and the remaining preservation/cleanup gates still require the protected recovery sequence.

## Gap closed

The predeploy readiness evaluator previously treated repository cleanliness, CI, disposable account-backup proof, build status, schema safety, and passing local runtime proof as sufficient to emit `READY_FOR_AUTHORIZED_DEPLOYMENT`.

That rule is unsafe while `docs/DB_RECOVERY_RUNBOOK.md` is active because R8 additionally requires R0–R7 production-recovery evidence. A successful local certification does not prove production R1 forensics, R1.5 account preservation, R2 containment, R3 raw backup/restore, R4 cleanup, optional R5 physical reclaim disposition, or R6 capacity convergence.

## New behavior

`scripts/ai-harness/evaluate-predeploy-readiness.mjs` now includes active-recovery gates for R0, R1, R1.5, R2, R3, R4, R5, R6, and R7.

The evaluator is deliberately fail-closed:

- omitted `productionRecovery` evidence means recovery remains active/unknown;
- omitted recovery gate status means that gate is not proven;
- `NOT_REQUIRED` is accepted only for R5;
- `READY_FOR_AUTHORIZED_DEPLOYMENT` is impossible during active recovery until every required recovery gate passes;
- post-incident `productionRecovery.active=false` additionally requires non-empty durable `closureEvidence`, so a bare boolean cannot bypass the recovery runbook.

A new verdict/recommendation pair makes the distinction explicit:

- `NOT_READY_RECOVERY`
- `COMPLETE_PRODUCTION_RECOVERY_GATES`

## Current R7 evidence

GitHub Actions run `34044694367` on merge commit `b4d3bdac13e73cb6458b630e0d4dec69fbd4990c` passed typecheck, full tests, release contract, production build, account backup round-trip certification, migration/bootstrap verification, and local production certification.

The subsequent `de5dd317ba67320600e5b8428a65565b9077daf0` commit only updates `docs/TEST_ATTESTATION.md` with `[skip ci]`, so the validated merge remains contained in current `main`.

This is sufficient durable repository/CI evidence to treat R7 as proven for the current candidate floor. It does not raise the proof ceiling for production recovery gates.

## Review pass

A second-pass review identified that an explicit `productionRecovery.active=false` without durable closure evidence would still be an unsupported escape hatch. The evaluator now emits a missing `recovery-closure-evidence` gate until a non-empty durable closure reference is supplied.

## Remaining deployment boundary

Repository/local-runtime false-green is closed by this sprint. Production deployment remains blocked by the operator-controlled recovery sequence. The next live evidence remains R1/R3 (parallel where operator capacity permits), followed by R1.5/R2, then R4, R5/R6, and finally one explicitly authorized R8 attempt.

No Render or Neon mutation is performed by this release.
