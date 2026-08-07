authorityRef: axtask.agent-authority.v1

# Skill: deployment readiness

id: axtask.skill.deploy-readiness.v1

## Purpose

Produce a fresh deploy/no-deploy decision for the exact AxTask candidate that may advance the production-connected `main` branch.

This adapts the useful release-engineering ideas from gstack `/ship` and `/land-and-deploy` without importing gstack's browser daemon, versioning scheme, host installers, or provider assumptions.

## Activation

Use when an operator says the repository is ready to deploy, wants to push or merge toward production, or asks whether current `main` is safe to deploy.

## Repository facts that control this skill

- `render.yaml` is deployment authority.
- `render.yaml` currently has `autoDeploy: true`.
- `main` is the production-connected branch.
- Advancing `main` can therefore initiate a live Render deployment.
- `npm run ship` only stages, commits, and pushes the current branch; it is not a deploy gate.
- `/health` is DB-free liveness. `/ready` is explicit database readiness only.
- Green CI and local certification are not live production proof.

## Required inputs

- exact candidate SHA;
- current `origin/main` SHA;
- current PR floor and target PR when one exists;
- changed paths against the currently deployed or current-main baseline;
- current CI/check results;
- selected validator plan and executed results;
- account-backup certification when runtime-affecting changes require it;
- local production certification when required;
- explicit proof ceiling.

## Procedure

1. Re-run repository intake for the exact candidate. Do not reuse a prior deploy verdict just because the candidate previously passed.
2. Confirm the production branch and `render.yaml` deployment semantics from the current candidate.
3. Confirm the candidate is current, the PR floor is understood, and no unrelated dirty work is being smuggled into the release.
4. Run `axtask.skill.predeploy-security-review.v1` when the diff touches dependencies, auth, CI/CD, environment contracts, Render/startup, migrations, or other deployment-sensitive surfaces.
5. Run validator selection from the real changed paths, then execute every required selected validator.
6. Require `npm run release:check`, `npm run check`, `npm test`, and `npm run build` when selected by the current change.
7. Require `npm run test:deploy` for deployment/startup/migration/health-sensitive changes.
8. Require account-backup round-trip proof when the existing registry/workflow marks it necessary.
9. Require `axtask.local-deployment-certification.v1` when local production acceptance is required.
10. Run `axtask.predeploy-cost-readiness.v1` from current evidence.
11. Accept `READY_FOR_AUTHORIZED_DEPLOYMENT` only for the exact candidate SHA whose evidence was just evaluated.
12. Emit exact missing gates with command, owner, and blocker when the candidate is not ready.
13. Hand off to `axtask.skill.authorized-main-deploy.v1` only after the readiness verdict is current and the operator separately authorizes live promotion.

## Re-run rule

Every invocation re-runs verification against the current candidate. Prior successful output is evidence history, not a waiver.

## Stop conditions

Stop before live mutation when:

- candidate SHA differs from the SHA evaluated;
- `main` moved after the evidence snapshot;
- CI or a required validator is failing or incomplete;
- required account-backup or local-runtime proof is absent;
- the predeploy evaluator does not emit `READY_FOR_AUTHORIZED_DEPLOYMENT`;
- live operator authorization is absent.

## Outputs

Use existing registered artifacts:

- `.ai/runs/<run-id>/repo-snapshot.json`
- `.ai/runs/<run-id>/validator-plan.json`
- `.ai/runs/<run-id>/predeploy-readiness.json`
- `.ai/runs/<run-id>/runtime-proof.json` when local certification runs
- `.ai/runs/<run-id>/operator-report.md`
- `.ai/runs/<run-id>/final-handoff.md`

## Guardrails

- No merge, push to `main`, Render mutation, Neon mutation, DNS mutation, or production request is performed by this skill.
- Never treat `npm run ship` as deployment certification.
- Never claim deployment because `main` is green.
- Never skip a verification step because an earlier run passed.
- Never print secrets, raw provider logs, database URLs, or sensitive environment values.

## Proof ceiling

Repository evidence plus local-runtime evidence only. The maximum verdict is readiness for a separately authorized live deployment.
