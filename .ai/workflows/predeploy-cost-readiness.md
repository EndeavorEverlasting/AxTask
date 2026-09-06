authorityRef: axtask.agent-authority.v1

# Pre-Deployment Cost and Readiness

id: axtask.predeploy-cost-readiness.v1

## Purpose

Determine whether a deployment is needed and which repository, local-runtime, and active production-recovery gates remain before any Render or Neon action. The workflow is repository-only by default and never invents provider pricing or production proof.

## Trigger

`deployment-considered` — a current release candidate is being evaluated for deployment.

## Inputs

A sanitized JSON evidence file containing:

- `currentMainSha` and `candidateSha`;
- `repositoryClean`;
- `blockingPrCount`;
- `ciGreen`;
- `changedPaths`;
- account-backup certification status;
- schema/migration status;
- production build status;
- local runtime status when available;
- `productionRecovery` status.

`productionRecovery` is fail-closed. During an active recovery, provide:

```json
{
  "productionRecovery": {
    "active": true,
    "gates": {
      "r0": "PASS",
      "r1": "PASS",
      "r1_5": "PASS",
      "r2": "PASS",
      "r3": "PASS",
      "r4": "PASS",
      "r5": "PASS",
      "r6": "PASS",
      "r7": "PASS"
    }
  }
}
```

R5 may use `NOT_REQUIRED` when post-cleanup evidence proves physical reclaim is unnecessary. Other recovery gates require `PASS` before R8. Omitting `productionRecovery`, omitting a required gate, or supplying any other status keeps deployment authorization blocked. Only after the incident is formally closed may normal future evaluations explicitly supply `productionRecovery.active=false`.

## Steps

1. Inspect repository and contract-impact evidence.
2. Classify changed paths into runtime, schema, and deployment-configuration impact.
3. Refuse deployment readiness when the worktree is dirty, blocking PRs remain, the candidate is stale, or required CI is not green.
4. For runtime-affecting changes, require current account backup round-trip proof and production build proof.
5. Require migration safety for schema-affecting changes.
6. If there is no runtime-affecting diff, emit `NO_DEPLOY_NEEDED`; do not wake provider resources.
7. If repository gates pass but local runtime proof is absent, emit `READY_FOR_LOCAL_ACCEPTANCE`.
8. After local runtime proof passes, evaluate the active recovery sequence from `docs/DB_RECOVERY_RUNBOOK.md`.
9. While any R0–R7 recovery prerequisite remains open, emit `NOT_READY_RECOVERY` / `COMPLETE_PRODUCTION_RECOVERY_GATES` and list the exact missing gates.
10. Only after local runtime proof and every active recovery prerequisite pass may the evaluator emit `READY_FOR_AUTHORIZED_DEPLOYMENT`.
11. Emit qualitative cost exposure only. Monetary estimates remain null unless a separately sourced pricing workflow is introduced.
12. Record exact missing gates with owner, command/operator action, and reason.

## Command

`node scripts/ai-harness/evaluate-predeploy-readiness.mjs --input <evidence.json> --output .ai/runs/<run-id>/predeploy-readiness.json`

## Verdicts

- `NOT_READY_REPOSITORY`
- `NOT_READY_BACKUP`
- `NOT_READY_SCHEMA`
- `NOT_READY_RUNTIME`
- `NOT_READY_RECOVERY`
- `READY_FOR_LOCAL_ACCEPTANCE`
- `READY_FOR_AUTHORIZED_DEPLOYMENT`

## Guardrails

- No Render API calls.
- No Neon connection.
- No production readiness probe.
- No deployment mutation.
- No monetary price fabrication.
- `/health` remains liveness and `/ready` remains explicit DB readiness in the separate local-certification workflow.
- Green CI is repository evidence, not live-runtime proof.
- A passing R7/local-runtime result never substitutes for R1/R1.5/R2/R3/R4/R5/R6 during an active recovery.
- `productionRecovery.active=false` is an explicit post-incident assertion; it must not be used to bypass an active runbook.

## Proof ceiling

Repository-evidence only. A `READY_FOR_AUTHORIZED_DEPLOYMENT` verdict means repository gates, supplied local-runtime evidence, and any declared active-recovery prerequisites satisfy this contract; it is not deployment authorization or production proof.
