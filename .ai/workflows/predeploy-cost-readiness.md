authorityRef: axtask.agent-authority.v1

# Pre-Deployment Cost and Readiness

id: axtask.predeploy-cost-readiness.v1

## Purpose

Determine whether a deployment is needed and which repository, local-runtime, and active production-recovery gates remain before any Render or Neon action. The workflow is repository-only by default and never invents provider pricing or production proof.

## Trigger

`deployment-considered` — a current release candidate is being evaluated for deployment.

## Inputs

A sanitized JSON evidence file containing repository cleanliness/current-candidate/CI evidence, changed paths, backup/schema/build/local-runtime status, and `productionRecovery` status.

During an active recovery, bind the packet to the exact candidate and give every gate both a status and a durable proof token:

```json
{
  "productionRecovery": {
    "active": true,
    "candidateSha": "<exact candidate SHA>",
    "gates": {
      "r0": {"status":"PASS","evidence":"operator-proof:r0-suspended"},
      "r1": {"status":"PASS","evidence":"artifact:production-audit.json"},
      "r1_5": {"status":"PASS","evidence":"artifact:account-evidence-manifest"},
      "r2": {"status":"PASS","evidence":"artifact:containment-proof"},
      "r3": {"status":"PASS","evidence":"artifact:backup-restore-manifest"},
      "r4": {"status":"PASS","evidence":"artifact:post-cleanup-audit"},
      "r5": {"status":"NOT_REQUIRED","evidence":"artifact:post-r4-physical-size-proof"},
      "r6": {"status":"PASS","evidence":"artifact:capacity-policy-result"},
      "r7": {"status":"PASS","evidence":"workflow:<exact local-cert run>"}
    }
  }
}
```

Active-gate durable evidence may use the repository proof prefixes `operator-proof:`, `artifact:`, `workflow:`, `run:`, `commit:`, or `merge:`. R5 may use `NOT_REQUIRED` only when its durable post-cleanup evidence proves physical reclaim is unnecessary. Other recovery gates require `PASS`. Missing candidate binding, missing evidence, plain string statuses, omitted gates, or unrecognized proof strings keep deployment blocked.

After the incident is formally closed, future evaluations may instead provide:

```json
{
  "productionRecovery": {
    "active": false,
    "closureEvidence": "operator-proof:<durable production incident-closure reference>"
  }
}
```

Incident closure is intentionally stricter than ordinary gate evidence: `active=false` accepts only a non-empty `operator-proof:` reference controlled by the operator. A local-certification `workflow:`/`run:` token, a repository commit, malformed value, or free-form note cannot close the production incident.

## Steps

1. Inspect repository and contract-impact evidence.
2. Classify changed paths into runtime, schema, and deployment-configuration impact.
3. Refuse deployment readiness when the worktree is dirty, blocking PRs remain, the candidate is stale, or required CI is not green.
4. For runtime-affecting changes, require current account backup round-trip proof and production build proof.
5. Require migration safety for schema-affecting changes.
6. If there is no runtime-affecting diff, emit `NO_DEPLOY_NEEDED`; do not wake provider resources.
7. If repository gates pass but local runtime proof is absent, emit `READY_FOR_LOCAL_ACCEPTANCE`.
8. After local runtime proof passes, evaluate the active recovery sequence from `docs/DB_RECOVERY_RUNBOOK.md`.
9. Require active-recovery evidence to be bound to `candidateSha` and require each accepted R0–R7 status to carry a durable proof token.
10. While any recovery prerequisite remains open, emit `NOT_READY_RECOVERY` / `COMPLETE_PRODUCTION_RECOVERY_GATES` with exact missing gates.
11. If recovery is declared inactive, require operator-controlled durable production incident-closure proof.
12. Only after local runtime proof and every active recovery prerequisite (or proven post-incident closure) pass may the evaluator emit `READY_FOR_AUTHORIZED_DEPLOYMENT`.
13. Emit qualitative cost exposure only; do not fabricate provider pricing.

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

- No Render API calls or provider mutation.
- No Neon connection or production probe.
- A passing R7/local-runtime result never substitutes for R1/R1.5/R2/R3/R4/R5/R6.
- Recovery proof is candidate-bound; stale evidence is not silently promoted to a moved head.
- `NOT_REQUIRED` is evidence-bearing and is accepted only for R5.
- `productionRecovery.active=false` requires `operator-proof:` production incident closure; local certification cannot close the incident.
- Green CI remains repository evidence, not live-runtime proof.

## Proof ceiling

Repository-evidence only. `READY_FOR_AUTHORIZED_DEPLOYMENT` means the supplied repository/local-runtime/recovery evidence satisfies this evaluator; it is not deployment authorization or production proof.
