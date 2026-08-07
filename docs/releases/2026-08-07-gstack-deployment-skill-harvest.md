# Gstack deployment skill harvest

Date: 2026-08-07

## Diagnosis

AxTask already had strong repository-only deployment readiness, account-backup certification, disposable local production certification, runtime-proof contracts, and failure recovery. The remaining gap was the release-engineering layer around those primitives: a fresh predeploy security/readiness pass, an explicit exact-SHA authorization boundary before production-connected `main` advances, and a post-deploy canary that distinguishes merge/deploy status from actual application health.

The gap matters because `render.yaml` currently has `autoDeploy: true`. Advancing `main` can therefore trigger a live Render deployment. The existing `npm run ship` command only stages, commits, and pushes the current branch and must not be mistaken for deployment certification.

## Change

Harvested only the AxTask-relevant deployment concepts from gstack `/ship`, `/land-and-deploy`, `/canary`, and the deployment-focused slice of `/cso`:

- added `axtask.main-branch-deployment.v1` as the fail-closed release sequence;
- added `axtask.skill.deploy-readiness.v1` for fresh exact-candidate readiness;
- added `axtask.skill.predeploy-security-review.v1` for bounded dependency, CI/CD, environment, startup, auth, and release-surface review;
- added `axtask.skill.authorized-main-deploy.v1` for the explicit live authorization and exact-SHA promotion boundary;
- added `axtask.skill.post-deploy-canary.v1` for read-only `/health`, public-shell, explicit `/ready`, provider/SHA evidence, and bounded regression verification;
- registered the workflow, skills, and deterministic triggers in the existing harness;
- bound `axtask.main-branch-deployment.v1` into validator selection so the workflow alone deterministically selects run-context validation, backup round-trip certification, predeploy readiness, local production certification, release/typecheck/test/build, and deployment contracts with their existing dependencies;
- pinned the deployment validator plan in `server/ai-harness/validator-selection-contract.test.ts`;
- pinned `main`, `autoDeploy: true`, and the `npm run ship` non-gate trap in the codebase map;
- added focused harness contract coverage for the deployment skill chain.

AxTask's existing predeploy evaluator, account-backup round-trip certification, local production certification, validator selection, runtime-proof schema, reports, and failure-recovery workflow remain canonical and are reused rather than duplicated.

## Explicitly not imported

- gstack browser/Chromium daemon;
- gstack versioning and CHANGELOG machinery;
- Claude/gbrain/host installation behavior;
- broad recurring OWASP/STRIDE phases unrelated to the AxTask release delta;
- provider-specific deployment behavior that is not already part of AxTask's Render contract.

## Scope

Changed:

- `.ai/codebase-map.json`
- `.ai/harness.json`
- `.ai/workflow-registry.json`
- `.ai/trigger-registry.json`
- `.ai/validator-registry.json`
- `.ai/workflows/main-branch-deployment.md`
- `.ai/skills/deploy-readiness.md`
- `.ai/skills/predeploy-security-review.md`
- `.ai/skills/authorized-main-deploy.md`
- `.ai/skills/post-deploy-canary.md`
- `server/ai-harness/harness-infrastructure-contract.test.ts`
- `server/ai-harness/validator-selection-contract.test.ts`
- this release note

Not changed:

- application behavior;
- `render.yaml` deployment configuration;
- production startup implementation;
- database schema or migrations;
- Render or Neon live state;
- production environment values.

## Rollout

Merge only after the current feature-branch release contract, harness/full tests, production build, disposable schema/bootstrap checks, account-backup certification, and local production certification are green for the exact candidate. Because Render auto-deploys from `main`, the merge itself must be treated as an explicitly authorized live deployment action and followed by the registered post-deploy canary.

## Rollback

Revert this harness-only PR if the imported release sequence conflicts with existing AxTask operating contracts. A rollback changes agent release guidance only; it does not undo any separately performed production deployment.

## Proof ceiling

Repository and CI validation can prove that the deployment skill chain is registered, internally consistent, and compatible with AxTask's existing certification surfaces. They do not prove a Render deployment occurred or that production is healthy. Live proof begins only when an explicitly authorized promotion and read-only post-deploy canary actually execute.
