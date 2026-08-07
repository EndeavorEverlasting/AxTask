authorityRef: axtask.agent-authority.v1

# Workflow: main branch deployment

id: axtask.main-branch-deployment.v1

## Purpose

Provide one fail-closed AxTask release sequence from candidate intake through production-connected `main` promotion and post-deploy verification.

The workflow harvests only the deployment-relevant gstack ideas: fresh verification on every release attempt, infrastructure detection before irreversible action, explicit authorization at the live boundary, exact candidate binding, and a post-deploy canary. AxTask's existing validators, backup certification, local production certification, and proof schemas remain canonical.

## Trigger

`main-branch-deployment-requested`

## Preconditions

- repository authority and harness are current;
- candidate/base SHAs are explicit;
- no unrelated work is included;
- deployment is intended for AxTask's Render-connected `main`;
- live mutation is not performed until the explicit authorization gate.

## Sequence

1. **Repository truth**
   - run `axtask.repository-intake.v1`;
   - refresh `origin/main`, PR floor, exact candidate SHA, and changed paths;
   - read `render.yaml` and `.ai/codebase-map.json`.
2. **Security delta**
   - run `axtask.skill.predeploy-security-review.v1` when deployment-sensitive/high-risk paths changed;
   - block on unresolved concrete security findings.
3. **Deploy readiness**
   - run `axtask.skill.deploy-readiness.v1`;
   - execute selected validators rather than treating selection as proof;
   - collect backup/local-runtime evidence required by current changes.
4. **Authorization gate**
   - require a current `READY_FOR_AUTHORIZED_DEPLOYMENT` verdict tied to the exact candidate;
   - require explicit operator authorization for the live promotion;
   - if either is absent, stop without advancing `main`.
5. **Promotion**
   - run `axtask.skill.authorized-main-deploy.v1`;
   - prefer the reviewed PR merge path;
   - record merge/main SHA and promotion timestamp;
   - because `autoDeploy: true`, treat this as the live-deployment trigger.
6. **Canary**
   - run `axtask.skill.post-deploy-canary.v1` as soon as live evidence can be collected;
   - record `/health`, explicit `/ready`, public-shell, provider identity/status, and expected SHA evidence when available.
7. **Closeout**
   - classify `HEALTHY`, `DEGRADED`, `BROKEN`, or `INCONCLUSIVE`;
   - render operator report and final handoff;
   - for unhealthy results, provide rollback/investigation action without performing destructive rollback unless separately authorized.

## Non-negotiable gates

- Do not use `npm run ship` as deployment certification.
- Do not promote a SHA that differs from the certified candidate.
- Do not reuse stale CI/local-runtime evidence after candidate or base changes.
- Do not claim live deployment from repository evidence.
- Do not claim health from merge/provider status alone.
- Do not force-update `main`.
- Do not run production `db:push` as an implicit deploy step.
- `/health` is liveness; `/ready` is explicit DB readiness.

## Canonical existing workflows reused

- `axtask.predeploy-cost-readiness.v1`
- `axtask.account-backup-roundtrip-certification.v1`
- `axtask.local-deployment-certification.v1`
- `axtask.failure-recovery.v1`

## Outputs

Use the existing artifact registry:

- repo snapshot;
- validator plan;
- predeploy readiness;
- account backup certification when applicable;
- runtime proof;
- operator report;
- final handoff.

## Proof ceiling

This workflow may reach live read-only health proof only when the live promotion and canary actually execute. Registration and contract tests alone prove only the repository deployment harness.
