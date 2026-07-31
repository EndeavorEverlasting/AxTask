# Pre-Deployment Cost and Readiness Harness

**Date:** 2026-07-31

## Delivered

AxTask now has a repository-owned evaluator that determines whether a candidate needs deployment and which gates remain before any authorized Render or Neon action.

The evaluator consumes sanitized repository evidence and classifies changed paths into application-runtime, schema, and deployment-configuration impact. It refuses readiness when the repository is dirty, blocking PRs remain, the candidate is stale, or required CI is not green. Runtime-affecting candidates additionally require current account-backup round-trip proof and a passing production build; schema-affecting candidates require migration safety.

## Deployment necessity

Documentation- and harness-only changes are explicitly classified as `NO_DEPLOY_NEEDED`. This prevents cloud resources from being contacted merely to determine whether a deployment is warranted.

## Cost evidence

The evaluator reports only qualitative exposure:

- `NONE_NO_DEPLOY_NEEDED`
- `APPLICATION_RUNTIME_EXPOSURE`
- `PROVIDER_AND_DATABASE_RUNTIME_EXPOSURE`

It never invents Render or Neon dollar estimates. `monetaryEstimate` remains null unless a separately sourced pricing contract is introduced.

## Verdicts

- `NOT_READY_REPOSITORY`
- `NOT_READY_BACKUP`
- `NOT_READY_SCHEMA`
- `NOT_READY_RUNTIME`
- `READY_FOR_LOCAL_ACCEPTANCE`
- `READY_FOR_AUTHORIZED_DEPLOYMENT`

Every failed gate includes an owner, exact command, and reason so convergence can move directly to the next executable proof.

## Artifacts

- `.ai/schemas/predeploy-readiness-result.schema.json`
- `.ai/workflows/predeploy-cost-readiness.md`
- `scripts/ai-harness/evaluate-predeploy-readiness.mjs`
- `server/ai-harness/predeploy-readiness-contract.test.ts`
- ignored `.ai/runs/<run-id>/predeploy-readiness.json`

The capability, workflow, trigger, artifact, and validator registries route deployment consideration through this evaluator.

## Rollout

This change requires no database migration, Render mutation, Neon connection, or production deployment. Merge only after exact-head repository CI and harness validation are green.

## Proof ceiling

Repository evidence only. `READY_FOR_AUTHORIZED_DEPLOYMENT` means the evaluator was supplied passing local-runtime evidence in addition to green repository gates; it is not itself deployment authorization, a provider-state check, or production acceptance.
