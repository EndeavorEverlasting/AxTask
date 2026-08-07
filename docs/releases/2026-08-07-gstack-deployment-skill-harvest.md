# Gstack deployment skill harvest

Date: 2026-08-07

## Diagnosis

AxTask already had strong repository-only deployment readiness, account-backup certification, disposable local production certification, runtime-proof contracts, and failure recovery. The missing layer was the release-engineering choreography around those primitives: a fresh predeploy security/readiness pass, an exact pre-merge candidate/base model, an explicit authorization boundary before production-connected `main` advances, and a post-deploy canary that distinguishes merge/deploy status from both application health and live release identity.

The gap matters because `render.yaml` currently has `autoDeploy: true`. The repository release contract treats `main` as production-connected, while the Render blueprint does not encode an explicit branch override. Advancing `main` must therefore be treated as a live deployment mutation. The pre-existing `npm run ship` wrapper staged/committed/pushed whichever branch was current and could run on `main`, so this sprint also closes that direct accidental-push path.

A final predeployment proof gap remained after the initial harvest: Node provenance/runtime guards were defined but not enforced by the owning release CI, production dependency advisories were not a release gate, and the candidate/base-bound security/readiness evidence was not preserved as a CI artifact. Closing that gap exposed real production dependency blockers before any Render or Neon mutation, including vulnerable `drizzle-orm`, `express-rate-limit`/`ip-address`, `multer`, `ws`, an unused `xlsx` dependency with no patched npm release, and moderate `esbuild` advisories through the Drizzle toolchain. Those findings were repaired rather than waived.

## Change

Harvested only the AxTask-relevant deployment concepts from gstack `/ship`, `/land-and-deploy`, `/canary`, and the deployment-focused slice of `/cso`:

- added `axtask.main-branch-deployment.v1` as the fail-closed security → readiness → authorization → promotion → canary sequence;
- added `axtask.skill.deploy-readiness.v1` for fresh exact-candidate readiness;
- corrected predeploy readiness so a pre-merge PR candidate is certified against its current observed PR/branch head and still-current `main` base rather than being required to equal `main` before authorization;
- defined `blockingPrCount` as other release-blocking PRs only, explicitly excluding the target candidate PR so the release does not block itself;
- extended readiness evidence with `currentCandidateSha`, `baseSha`, and `promotionWillAutoDeploy`, plus separate candidate-current/base-current gates;
- separated runtime-diff impact from promotion impact: a docs/harness-only change can still require the full deployment floor when advancing production-connected `main` will trigger Render auto-deploy;
- added `axtask.skill.predeploy-security-review.v1` as a mandatory bounded review for every main-promotion candidate; low-risk diffs still emit a current `CLEAR` artifact with an empty findings array rather than skipping security evidence;
- added a machine-readable `.ai/runs/<run-id>/predeploy-security-review.json` artifact/schema whose `CLEAR` disposition is bound to the exact candidate/base and required at the authorization boundary;
- added `axtask.skill.authorized-main-deploy.v1` with a post-authorization GitHub re-fetch to close PR-head/base/check TOCTOU drift before merge;
- added `axtask.skill.post-deploy-canary.v1`; `HEALTHY` now requires trustworthy live deployment identity matching the expected release, while `LIVE_SHA_UNVERIFIED` is explicitly `INCONCLUSIVE` even when health endpoints pass;
- registered the workflow, skills, artifacts, schemas, and deterministic triggers in the existing harness;
- bound `axtask.main-branch-deployment.v1` into validator selection so the workflow alone deterministically selects run-context validation, backup round-trip certification, predeploy readiness, local production certification, release/typecheck/test/build, and deployment contracts with their existing dependencies;
- added a `main` hard stop to `scripts/ship.ps1` before any `git add`, commit, or push and aligned the codebase-map command contract;
- made harness tests read `render.yaml` for authoritative `autoDeploy`, verify the lack of an explicit Render branch override, assert the deployment skill sequence in order, verify the security artifact schema/trigger binding, and prove the ship-on-main guard occurs before staging;
- added diagnosis, testing, rollout, rollback/recovery notes, and a Mermaid failure-chain diagram to the main deployment workflow;
- pinned the owning CI application runtime to Node `20.20.2` so provenance approval cannot drift with a floating `20` selector;
- captured the pinned GitHub-hosted Node `20.20.2` linux/x64 binary through an intentional fail-closed provenance run and approved only fingerprint `6295488653f0d93b0a157841746fef7e72cc4328cfb60c4bbe0ca2668a836ffd` in `.security/approved-node-provenance.json`;
- made Node provenance, Node runtime, and Axios guards execute before typecheck/tests/build in `test-and-attest`;
- added a permanent `npm audit --omit=dev --audit-level=moderate` release gate before the runtime guards;
- removed unused `xlsx` instead of accepting its unpatched prototype-pollution/ReDoS surface;
- raised vulnerable direct runtime floors to `drizzle-orm ^0.45.2`, `express ^4.22.2`, `express-rate-limit ^8.6.1`, `multer ^2.2.0`, and `ws ^8.21.1`, and raised `postcss` to `^8.5.23`;
- pinned direct `esbuild` to `0.28.1` and added `overrides.esbuild=0.28.1` so nested Drizzle tooling also resolves the patched build binary;
- preserved `drizzle-kit` because the production launcher intentionally retains an explicit operator-only legacy schema-push recovery override; the migration/Drizzle CI remains responsible for proving that patched resolution works;
- used two branch-only one-shot lock-repair workflows to regenerate `package-lock.json` from npm and require clean audit evidence before committing; both temporary workflows were deleted immediately after their bounded repair completed and are not part of the permanent release machinery;
- added `scripts/ai-harness/generate-predeploy-ci-proof.mjs`, which re-runs all three security guards, verifies exact clean candidate checkout, reads current `render.yaml`, computes the real candidate diff, and refuses to emit proof unless the existing readiness evaluator returns `READY_FOR_AUTHORIZED_DEPLOYMENT` with no missing gates;
- added a `predeploy-proof` CI job that runs only after `test-and-attest` and Docker build succeed, checks out the exact PR head, refreshes current `main` and PR-head state, counts other open PRs conservatively, generates the candidate/base-bound evidence, and uploads it as `predeploy-proof-<candidate-sha>` without contacting Render or Neon;
- added executable contract coverage for the proof generator, pinned Node runtime/fingerprint, moderate-or-higher production dependency audit, guard ordering, proof-job dependency order, exact candidate checkout, and artifact upload.

AxTask's existing account-backup round-trip certification, local production certification, validator selection, runtime-proof schema, reports, and failure-recovery workflow remain canonical and are reused rather than duplicated.

## Explicitly not imported

- gstack browser/Chromium daemon;
- gstack versioning and CHANGELOG machinery;
- Claude/gbrain/host installation behavior;
- broad recurring OWASP/STRIDE phases unrelated to the AxTask release delta;
- provider-specific deployment behavior that is not already supported by AxTask repository evidence.

## Scope

Changed deployment/harness and release-security surfaces include:

- `.github/workflows/test-and-attest.yml`
- `.security/approved-node-provenance.json`
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
- `scripts/ai-harness/generate-predeploy-ci-proof.mjs`
- `scripts/ship.ps1`
- `server/ai-harness/predeploy-readiness-contract.test.ts`
- `server/ai-harness/predeploy-ci-proof-contract.test.ts`
- `server/ai-harness/harness-infrastructure-contract.test.ts`
- `server/ai-harness/validator-selection-contract.test.ts`
- `package.json`
- `package-lock.json`
- this release note

Not changed:

- application feature behavior;
- `render.yaml` deployment configuration itself;
- production startup implementation;
- database schema or migrations;
- Render or Neon live state;
- production environment values.

## Testing

The branch must pass the repository's full PR CI after every release-sensitive change. The critical contract additions cover pre-merge PR readiness, stale PR-head rejection, base-main drift rejection, candidate-PR exclusion from the blocking floor, auto-deploy promotion exposure for docs/harness-only diffs, mandatory candidate/base-bound security evidence, deployment workflow ordering, `render.yaml` autoDeploy alignment, ship-on-main rejection before staging, exact main-deployment validator routing, post-deploy identity requirements, pinned shared Node provenance, moderate-or-higher production dependency advisory gating, security-guard ordering, and CI artifact generation only after the owning local-production floor passes.

The dependency repair path itself proved npm could regenerate the lock with the patched runtime floors and pass `npm audit --omit=dev --audit-level=moderate` before committing. Permanent owning CI re-runs that same moderate audit, then Node provenance/runtime/Axios guards, typecheck, full tests, release guard, production build, Playwright regression, performance budgets, fresh Drizzle/migration/idempotence proof, account-backup certification, schema verification, local production certification, Docker image validation, and finally exact-candidate predeploy evidence generation/upload. The predeploy proof job performs only repository/read-only GitHub checks; it does not contact Render or Neon.

## Rollout

Merge only after the final exact feature-branch head is green, review findings are resolved, and the uploaded `predeploy-proof-<candidate-sha>` contains a `CLEAR` security review plus `READY_FOR_AUTHORIZED_DEPLOYMENT` readiness result for the same current candidate/base. The operator must then explicitly authorize the main promotion. Because Render auto-deploy is enabled and the repository release contract treats `main` as production-connected, the merge itself is the live boundary and must be followed by the registered post-deploy canary with live identity verification.

## Rollback

Revert this harness/tooling/dependency PR through the normal reviewed-PR path if the release sequence or patched dependency set conflicts with AxTask operating contracts. A live application rollback is separate production mutation and requires separate operator authorization; canary failure alone does not authorize an automatic rollback.

## Proof ceiling

Repository and CI validation can prove that the deployment skill chain is registered, ordered, internally consistent, compatible with AxTask's existing certification surfaces, the production dependency graph is free of moderate-or-higher advisories at audit time, and the exact candidate has a downloadable predeploy evidence bundle. Local production certification proves the real production launcher only against disposable local PostgreSQL. Neither proves a Render deployment occurred or that the expected release is healthy in production. Live proof begins only when an explicitly authorized promotion executes and the read-only canary ties observed production identity to the expected release.
