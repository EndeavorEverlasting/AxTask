# Active / Transitional / Legacy Index

This index is the canonical architecture-cleanup map for AxTask and NodeWeaver integration policy.

## Canonical Principles

- NodeWeaver is **hybrid**: internal monorepo component by default, optional external service mode by deployment profile.
- Classification ownership is **shared**: NodeWeaver engine core + AxTask fallback/orchestration.
- Keep one active source per concern (architecture, deployment policy, PR segmentation).
- Voice personalization is **RAG-contract driven**: retrieval-first adaptation with privacy/security governance.

## Active (authoritative)

- `README.md`
- `docs/README.md` (canonical completion-first philosophy and doctrine contract hub)
- `docs/NODEWEAVER.md` (NodeWeaver standalone product vs vendored monorepo path)
- `docs/ARCHITECTURE.md`
- `docs/DEBUGGING_REFERENCE.md` (deployment-impact test sweep and debugging patterns)
- `docs/PR_SEGMENTATION.md`
- `docs/REPORT_ENGINE_AGENT_CONTRACTS.md`
- `docs/CLARIFICATION_PROTOCOL.md`
- `docs/RAG_CLASSIFICATION_BLUEPRINT.md`
- `docs/ORB_AVATAR_EXPERIENCE_CONTRACT.md`
- `docs/COMMUNITY_AUTOMATION_PRIVACY_CONTRACT.md`
- `docs/SECURITY.md` (voice personalization retrieval security controls and incident guardrails)
- `.github/workflows/pr-file-limit.yml`
- `tools/ci/check-pr-file-count.mjs`
- `tools/local/split-pr-helper.mjs`
- `tools/local/pr-factor.mjs`
- NodeWeaver integration runtime and fallback:
  - `server/routes.ts`
  - `server/services/classification/universal-classifier.ts`
  - `server/engines/feedback-engine.ts`
- Mini-games runtime (Flashcard Sprint live; MCQ scaffold in UI until session contract expands):
  - `client/src/pages/mini-games.tsx`
  - `client/src/lib/study-api.ts`
  - `server/routes.ts`
  - `server/storage.ts`
  - `shared/schema.ts`
  - `migrations/0005_study_mini_games.sql`

## Transitional (operational runbooks, not architecture truth)

- `docs/DEPLOYMENT_MIGRATION_PLAN.md`
- `docs/MORNING_NEW_BOX_MIGRATION_GUIDE.md`
- `docs/MORNING_NEW_BOX_MIGRATION_CHECKLIST.md`
- `docs/NEXT_SETUP_BLUEPRINT.md`
- `docs/CUTOVER_RUNBOOK.md`

## Legacy (non-authoritative / quarantine)

- `NodeWeaver._pre_submodule_backup` — **removed from git** (was a stale submodule gitlink; `.gitignore` may still ignore a local folder name). Do not re-add as a submodule. Canonical NodeWeaver path: `services/nodeweaver/upstream` ([`docs/NODEWEAVER.md`](NODEWEAVER.md)).
- `docs/VERSION_1.3.0_PLAN.md`

## Dirty-File Curation Rule (deployment branches)

Apply this deterministic filter in order:

1. If required for active runtime correctness (mini-games, NodeWeaver contract, classifier orchestration) -> include.
2. If required for deployment/review policy integrity (CI checks, segmentation tooling, canonical docs) -> include.
3. Otherwise -> exclude to follow-up branch.
