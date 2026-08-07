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
- `promotionWillAutoDeploy` — set `true` when the contemplated main promotion itself will cause a provider deploy/restart even if the diff is docs/harness-only;
- `repositoryClean`;
- `blockingPrCount`;
- `ciGreen`;
- `changedPaths`;
- account-backup certification status;
- schema/migration status;
- production build status;
- local runtime status when available.

Legacy current-main evaluation may omit `currentCandidateSha` and `baseSha`; the evaluator then treats current main as the observed candidate. Pre-promotion PR evaluation must provide both fields so readiness never requires merging first. The `axtask.main-branch-deployment.v1` path must set `promotionWillAutoDeploy: true` while repository evidence says the production-connected main promotion will trigger Render auto-deploy.

## Steps

1. Inspect repository and contract-impact evidence.
2. Classify changed paths into runtime, schema, and deployment-configuration impact.
3. Separately determine whether the intended main promotion will trigger a provider deploy/restart via `promotionWillAutoDeploy`.
4. Refuse deployment readiness when the worktree is dirty, blocking PRs remain, the exact candidate differs from the currently observed release ref/PR head, the recorded base differs from current main, or required CI is not green.
5. When either the diff is runtime-affecting **or** the planned promotion will auto-deploy, require current account backup round-trip proof and production build proof.
6. Require migration safety for schema-affecting changes.
7. If there is no runtime-affecting diff and no planned auto-deploy promotion, emit `NO_DEPLOY_NEEDED`; do not wake provider resources.
8. If an auto-deploy main promotion is planned for a docs/harness-only diff, classify provider runtime exposure and continue through local production acceptance rather than falsely emitting `NO_DEPLOY_NEEDED`.
9. If repository gates pass but local runtime proof is absent, emit `READY_FOR_LOCAL_ACCEPTANCE`.
10. Only after local runtime proof is explicitly recorded as passing may the evaluator emit `READY_FOR_AUTHORIZED_DEPLOYMENT`.
11. Emit qualitative cost exposure only. Monetary estimates remain null unless a separately sourced pricing workflow is introduced.
12. Record exact missing gates with owner, command, and reason.

## Candidate-current invariant

A normal pre-promotion candidate lives on a feature branch/PR and is expected to differ from `main`. `candidate-current` therefore proves `candidateSha === currentCandidateSha`. When `baseSha` is supplied, `base-current` separately proves `baseSha === currentMainSha`. Neither gate requires the feature candidate to land on `main` before authorization.

## Auto-deploy invariant

`classifyChangedPaths().deploymentNeeded` describes whether the diff changes runtime code/config. Top-level `deploymentNeeded` additionally becomes true when `promotionWillAutoDeploy` is true. This prevents a docs/harness-only change from bypassing the deploy floor when advancing production-connected `main` will still restart/deploy the service.

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
- Never emit `NO_DEPLOY_NEEDED` for a planned main promotion that repository evidence says will auto-deploy.
- `/health` remains liveness and `/ready` remains explicit DB readiness in the separate local-certification workflow.
- Green CI is repository evidence, not live-runtime proof.

## Proof ceiling

Repository-evidence only. A `READY_FOR_AUTHORIZED_DEPLOYMENT` verdict means repository gates and supplied local-runtime evidence satisfy this contract for the exact candidate/base/promotion snapshot; it is not deployment authorization or production proof.
