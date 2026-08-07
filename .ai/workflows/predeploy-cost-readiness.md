authorityRef: axtask.agent-authority.v1

# Pre-Deployment Cost and Readiness

id: axtask.predeploy-cost-readiness.v1

## Purpose

Determine whether a deployment is needed and which repository/local-runtime gates remain before any Render or Neon action. The workflow is repository-only by default and never invents provider pricing.

## Trigger

`deployment-considered` — a current release candidate is being evaluated for deployment.

## Inputs

A sanitized JSON evidence file containing:

- `candidateSha` — the exact release candidate being certified;
- `currentCandidateSha` — the currently observed candidate ref/PR-head SHA;
- `baseSha` — the main SHA the candidate/readiness snapshot is based on;
- `currentMainSha` — current observed `origin/main` SHA;
- `repositoryClean`;
- `blockingPrCount`;
- `ciGreen`;
- `changedPaths`;
- account-backup certification status;
- schema/migration status;
- production build status;
- local runtime status when available.

Legacy current-main evaluation may omit `currentCandidateSha` and `baseSha`; the evaluator then treats current main as the observed candidate. Pre-promotion PR evaluation must provide both fields so readiness never requires merging first.

## Steps

1. Inspect repository and contract-impact evidence.
2. Classify changed paths into runtime, schema, and deployment-configuration impact.
3. Refuse deployment readiness when the worktree is dirty, blocking PRs remain, the exact candidate differs from the currently observed release ref/PR head, the recorded base differs from current main, or required CI is not green.
4. For runtime-affecting changes, require current account backup round-trip proof and production build proof.
5. Require migration safety for schema-affecting changes.
6. If there is no runtime-affecting diff, emit `NO_DEPLOY_NEEDED`; do not wake provider resources.
7. If repository gates pass but local runtime proof is absent, emit `READY_FOR_LOCAL_ACCEPTANCE`.
8. Only after local runtime proof is explicitly recorded as passing may the evaluator emit `READY_FOR_AUTHORIZED_DEPLOYMENT`.
9. Emit qualitative cost exposure only. Monetary estimates remain null unless a separately sourced pricing workflow is introduced.
10. Record exact missing gates with owner, command, and reason.

## Candidate-current invariant

A normal pre-promotion candidate lives on a feature branch/PR and is expected to differ from `main`. `candidate-current` therefore proves `candidateSha === currentCandidateSha`. When `baseSha` is supplied, `base-current` separately proves `baseSha === currentMainSha`. Neither gate requires the feature candidate to land on `main` before authorization.

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
- Never make a pre-merge candidate equal `main` merely to satisfy readiness.
- `/health` remains liveness and `/ready` remains explicit DB readiness in the separate local-certification workflow.
- Green CI is repository evidence, not live-runtime proof.

## Proof ceiling

Repository-evidence only. A `READY_FOR_AUTHORIZED_DEPLOYMENT` verdict means repository gates and supplied local-runtime evidence satisfy this contract for the exact candidate/base snapshot; it is not deployment authorization or production proof.
