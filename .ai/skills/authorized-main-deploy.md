authorityRef: axtask.agent-authority.v1

# Skill: authorized main deploy

id: axtask.skill.authorized-main-deploy.v1

## Purpose

Perform the final, explicitly authorized AxTask promotion to the production-connected `main` branch and hand immediately to live verification.

This adapts the useful safety boundary from gstack `/land-and-deploy`: re-check readiness immediately before the irreversible action, bind authorization to an exact candidate, merge/promo once, and verify production separately.

## Activation

Use only when all of the following are true:

- `axtask.predeploy-cost-readiness.v1` emitted `READY_FOR_AUTHORIZED_DEPLOYMENT`;
- that verdict names the exact candidate SHA being promoted and the current candidate ref still matches it;
- `.ai/runs/<run-id>/predeploy-security-review.json` exists, matches `.ai/schemas/predeploy-security-review-result.schema.json`, names the same candidate SHA and base SHA, and has disposition `CLEAR`;
- required CI and validators are current and passing on that exact candidate;
- `origin/main` still equals the base SHA bound into both the readiness and security-review artifacts;
- the operator explicitly authorizes the live deployment/main promotion in the current operation.

Any candidate-head or base change invalidates both readiness and security authorization evidence and requires those gates to run again.

## Critical deployment fact

`render.yaml` has `autoDeploy: true`; AxTask's repository release contract treats `main` as the production-connected branch. Advancing `main` may therefore trigger Render automatically. Treat the GitHub main-branch mutation itself as the live deployment action.

## Procedure

1. Re-read `render.yaml` and the repository deployment contract; confirm auto-deploy is still enabled and no repository deployment assumption changed.
2. Re-fetch GitHub state and record the readiness snapshot values:
   - current `main` SHA;
   - candidate SHA;
   - target PR number/head SHA when a PR exists;
   - mergeability and required checks.
3. Re-validate that both the readiness artifact and the `CLEAR` predeploy-security-review artifact apply to this exact candidate and current base.
4. Confirm explicit operator authorization is present. If not, stop with the exact ready candidate SHA and the one live action that remains.
5. **Post-authorization TOCTOU gate:** immediately re-fetch GitHub state again before any merge. Re-check the intended PR number, PR head SHA, current `main` SHA, mergeability, and required checks against the snapshot from steps 2-3. If any PR/head/base/check value changed, stop without merging, report the mismatch, and rerun readiness/security as required.
6. Prefer the reviewed PR merge path. Do not use `npm run ship` as a substitute for merge/deploy authorization.
7. Merge only the re-verified intended PR/head SHA and record the resulting main/merge SHA.
8. Do not claim Render deployment completion from the merge result.
9. Record the live-deployment start timestamp and exact resulting main SHA.
10. Route immediately to `axtask.skill.post-deploy-canary.v1`.
11. If merge fails, checks regress, or main moves unexpectedly, stop and route through `axtask.failure-recovery.v1`. Do not force-update `main`.

## Forbidden

- force push to `main`;
- merge a different head SHA than the authorized candidate;
- merge after authorization without the post-authorization GitHub re-check;
- proceed without a current `CLEAR` security-review artifact bound to the same candidate/base;
- disable CI/checks to get the deploy through;
- manually run production migrations or `db:push` as an implicit part of this skill;
- mutate Render/Neon configuration outside separately authorized scope;
- claim production health before canary evidence.

## Outputs

Record in the operator report/final handoff:

- authorized candidate SHA and base SHA;
- predeploy-readiness artifact;
- predeploy-security-review artifact and `CLEAR` disposition;
- operator authorization marker/context;
- PR number and head SHA when applicable;
- post-authorization re-check evidence;
- merge/main SHA;
- promotion timestamp;
- exact post-deploy verification action.

## Proof ceiling

The main-branch mutation proves promotion only. It does not prove Render successfully deployed, the app became healthy, the database became ready, or users can complete workflows.
