authorityRef: axtask.agent-authority.v1

# Pre-Deployment Cost and Readiness

id: axtask.predeploy-cost-readiness.v1

## Purpose

Determine whether a deployment is needed and which repository/local-runtime gates remain before any Render or Neon action. The workflow is repository-only by default and never invents provider pricing.

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
- local runtime status when available.

## Steps

1. Inspect repository and contract-impact evidence.
2. Classify changed paths into runtime, schema, and deployment-configuration impact.
3. Refuse deployment readiness when the worktree is dirty, blocking PRs remain, the candidate is stale, or required CI is not green.
4. For runtime-affecting changes, require current account backup round-trip proof and production build proof.
5. Require migration safety for schema-affecting changes.
6. If there is no runtime-affecting diff, emit `NO_DEPLOY_NEEDED`; do not wake provider resources.
7. If repository gates pass but local runtime proof is absent, emit `READY_FOR_LOCAL_ACCEPTANCE`.
8. Only after local runtime proof is explicitly recorded as passing may the evaluator emit `READY_FOR_AUTHORIZED_DEPLOYMENT`.
9. Emit qualitative cost exposure only. Monetary estimates remain null unless a separately sourced pricing workflow is introduced.
10. Record exact missing gates with owner, command, and reason.

## Command

`node scripts/ai-harness/evaluate-predeploy-readiness.mjs --input <evidence.json> --output .ai/runs/<run-id>/predeploy-readiness.json`

## Verdicts

- `NOT_READY_REPOSITORY`
- `NOT_READY_BACKUP`
- `NOT_READY_SCHEMA`
- `NOT_READY_RUNTIME`
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

## Proof ceiling

Repository-evidence only. A `READY_FOR_AUTHORIZED_DEPLOYMENT` verdict means repository gates and supplied local-runtime evidence satisfy this contract; it is not deployment authorization or production proof.
