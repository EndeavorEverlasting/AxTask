# Gstack deployment skill harvest

Date: 2026-08-07

## Diagnosis

AxTask already had strong repository-only deployment readiness, account-backup certification, disposable local production certification, runtime-proof contracts, and failure recovery. The missing layer was the release-engineering choreography around those primitives: a fresh predeploy security/readiness pass, an exact pre-merge candidate/base model, an explicit authorization boundary before production-connected `main` advances, and a post-deploy canary that distinguishes merge/deploy status from both application health and live release identity.

The gap matters because `render.yaml` currently has `autoDeploy: true`. The repository release contract treats `main` as production-connected, while the Render blueprint does not encode an explicit branch override. Advancing `main` must therefore be treated as a live deployment mutation. The pre-existing `npm run ship` wrapper staged/committed/pushed whichever branch was current and could run on `main`, so this sprint also closes that direct accidental-push path.

## Change

Harvested only the AxTask-relevant deployment concepts from gstack `/ship`, `/land-and-deploy`, `/canary`, and the deployment-focused slice of `/cso`:

- added `axtask.main-branch-deployment.v1` as the fail-closed security → readiness → authorization → promotion → canary sequence;
- added `axtask.skill.deploy-readiness.v1` for fresh exact-candidate readiness;
- corrected predeploy readiness so a pre-merge PR candidate is certified against its current observed PR/branch head and still-current `main` base rather than being required to equal `main` before authorization;
- extended readiness evidence with `currentCandidateSha` and `baseSha`, plus a separate `base-current` gate;
- added `axtask.skill.predeploy-security-review.v1` for bounded dependency, CI/CD, environment, startup, auth, and deployment-control-harness review;
- added a machine-readable `.ai/runs/<run-id>/predeploy-security-review.json` artifact/schema whose `CLEAR` disposition is bound to the exact candidate/base and required at the authorization boundary;
- added `axtask.skill.authorized-main-deploy.v1` with a post-authorization GitHub re-fetch to close PR-head/base/check TOCTOU drift before merge;
- added `axtask.skill.post-deploy-canary.v1`; `HEALTHY` now requires trustworthy live deployment identity matching the expected release, while `LIVE_SHA_UNVERIFIED` is explicitly `INCONCLUSIVE` even when health endpoints pass;
- registered the workflow, skills, artifacts, schemas, and deterministic triggers in the existing harness;
- bound `axtask.main-branch-deployment.v1` into validator selection so the workflow alone deterministically selects run-context validation, backup round-trip certification, predeploy readiness, local production certification, release/typecheck/test/build, and deployment contracts with their existing dependencies;
- added a `main` hard stop to `scripts/ship.ps1` before any `git add`, commit, or push and aligned the codebase-map command contract;
- made harness tests read `render.yaml` for authoritative `autoDeploy`, verify the lack of an explicit Render branch override, assert the deployment skill sequence in order, verify the security artifact schema/trigger binding, and prove the ship-on-main guard occurs before staging;
- added diagnosis, testing, rollout, rollback/recovery notes, and a Mermaid failure-chain diagram to the main deployment workflow.

AxTask's existing account-backup round-trip certification, local production certification, validator selection, runtime-proof schema, reports, and failure-recovery workflow remain canonical and are reused rather than duplicated.

## Explicitly not imported

- gstack browser/Chromium daemon;
- gstack versioning and CHANGELOG machinery;
- Claude/gbrain/host installation behavior;
- broad recurring OWASP/STRIDE phases unrelated to the AxTask release delta;
- provider-specific deployment behavior that is not already supported by AxTask repository evidence.

## Scope

Changed deployment/harness surfaces include:

- `.ai/codebase-map.json`
- `.ai/harness.json`
- `.ai/artifact-registry.json`
- `.ai/workflow-registry.json`
- `.ai/trigger-registry.json`
- `.ai/validator-registry.json`
- `.ai/schemas/predeploy-readiness-result.schema.json`
- `.ai/schemas/predeploy-security-review-result.schema.json`
- `.ai/workflows/predeploy-cost-readiness.md`
- `.ai/workflows/main-branch-deployment.md`
- `.ai/skills/deploy-readiness.md`
- `.ai/skills/predeploy-security-review.md`
- `.ai/skills/authorized-main-deploy.md`
- `.ai/skills/post-deploy-canary.md`
- `scripts/ai-harness/evaluate-predeploy-readiness.mjs`
- `scripts/ship.ps1`
- `server/ai-harness/predeploy-readiness-contract.test.ts`
- `server/ai-harness/harness-infrastructure-contract.test.ts`
- `server/ai-harness/validator-selection-contract.test.ts`
- this release note

Not changed:

- application feature behavior;
- `render.yaml` deployment configuration itself;
- production startup implementation;
- database schema or migrations;
- Render or Neon live state;
- production environment values.

## Testing

The branch must pass the repository's full PR CI after every review-driven change. The critical contract additions cover pre-merge PR readiness, stale PR-head rejection, base-main drift rejection, deployment workflow ordering, current security-clear evidence, `render.yaml` autoDeploy alignment, ship-on-main rejection before staging, exact main-deployment validator routing, and post-deploy identity requirements. The owning CI also runs production build, Playwright regression, performance budgets, fresh Drizzle/migration/idempotence proof, account-backup certification, schema verification, and local production certification.

## Rollout

Merge only after the final exact feature-branch head is green, review findings are resolved, readiness/security evidence is current for the same candidate/base, and the operator explicitly authorizes the main promotion. Because Render auto-deploy is enabled and the repository release contract treats `main` as production-connected, the merge itself is the live boundary and must be followed by the registered post-deploy canary with live identity verification.

## Rollback

Revert this harness/tooling PR through the normal reviewed-PR path if the imported release sequence conflicts with AxTask operating contracts. A live application rollback is separate production mutation and requires separate operator authorization; canary failure alone does not authorize an automatic rollback.

## Proof ceiling

Repository and CI validation can prove that the deployment skill chain is registered, ordered, internally consistent, and compatible with AxTask's existing certification surfaces. Local production certification proves the real production launcher only against disposable local PostgreSQL. Neither proves a Render deployment occurred or that the expected release is healthy in production. Live proof begins only when an explicitly authorized promotion executes and the read-only canary ties observed production identity to the expected release.
