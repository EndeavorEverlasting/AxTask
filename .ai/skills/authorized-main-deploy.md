authorityRef: axtask.agent-authority.v1

# Skill: authorized main deploy

id: axtask.skill.authorized-main-deploy.v1

## Purpose

Perform the final, explicitly authorized AxTask promotion to the production-connected `main` branch and hand immediately to live verification.

This adapts the useful safety boundary from gstack `/land-and-deploy`: re-check readiness immediately before the irreversible action, bind authorization to an exact candidate, merge/promo once, and verify production separately.

## Activation

Use only when all of the following are true:

- `axtask.predeploy-cost-readiness.v1` emitted `READY_FOR_AUTHORIZED_DEPLOYMENT`;
- that verdict names the exact candidate SHA being promoted;
- required CI and validators are current and passing;
- `origin/main` has not moved since the readiness snapshot, or readiness was refreshed against the new main;
- the operator explicitly authorizes the live deployment/main promotion in the current operation.

## Critical deployment fact

`render.yaml` has `autoDeploy: true`. Merging or otherwise advancing production-connected `main` may trigger Render automatically. Treat the GitHub main-branch mutation itself as the live deployment action.

## Procedure

1. Re-read `render.yaml` and confirm `main` remains the production-connected auto-deploy branch.
2. Re-fetch GitHub state and record:
   - current `main` SHA;
   - candidate SHA;
   - target PR number/head SHA when a PR exists;
   - mergeability and required checks.
3. Re-validate that the readiness artifact applies to this exact candidate and current base.
4. Confirm explicit operator authorization is present. If not, stop with the exact ready candidate SHA and the one action that remains.
5. Prefer the reviewed PR merge path. Do not use `npm run ship` as a substitute for merge/deploy authorization.
6. Merge only the intended PR/head SHA and record the resulting main/merge SHA.
7. Do not claim Render deployment completion from the merge result.
8. Record the live-deployment start timestamp and exact main SHA.
9. Route immediately to `axtask.skill.post-deploy-canary.v1`.
10. If merge fails, checks regress, or main moves unexpectedly, stop and route through failure recovery. Do not force-update `main`.

## Forbidden

- force push to `main`;
- merge a different head SHA than the authorized candidate;
- disable CI/checks to get the deploy through;
- manually run production migrations or `db:push` as an implicit part of this skill;
- mutate Render/Neon configuration outside separately authorized scope;
- claim production health before canary evidence.

## Outputs

Record in the operator report/final handoff:

- authorized candidate SHA;
- predeploy-readiness artifact;
- operator authorization marker/context;
- PR number when applicable;
- merge/main SHA;
- promotion timestamp;
- exact post-deploy verification action.

## Proof ceiling

The main-branch mutation proves promotion only. It does not prove Render successfully deployed, the app became healthy, the database became ready, or users can complete workflows.
