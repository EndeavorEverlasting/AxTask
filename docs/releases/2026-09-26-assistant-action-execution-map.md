# Assistant action execution map

## Diagnosis

PR #157 established the provider-neutral assistant-action architecture, but the successor work was still too coarse for low-judgment local agents and did not separate ChatGPT-runtime-only acceptance from local repository implementation. The requested `prompt-parallel-dispatch` contract/runner is also absent on the current AxTask floor.

## Change

- Added `docs/ASSISTANT_ACTION_EXECUTION_PLAN.md` with a deterministic runtime-vs-local lane map, dependency graph, owned/forbidden surfaces, validation gates, and proof ceilings.
- Added the 2026-09-27 four-task day-plan fixture and schema-compatible reviewed task payload.
- Defined the review-and-apply flow using existing command-palette and bulk-action UI patterns without making UI types the canonical domain contract.
- Added `Outputs/prompt-parallel-dispatch/manifest.json` as the planned dispatch artifact, explicitly marked blocked until the missing harness contract/runner is implemented and validates it.
- Updated AXQ-009 / architecture references so Phase 1 cannot start from chat-only planning.

## Rollout

Planning/harness-orchestration documentation only. No task, auth, database, calendar-sync, scheduled-worker, deployment, or production behavior changes.

## Rollback

Revert the execution-plan, dispatch-manifest, architecture/queue cross-links, and this release note.

## Testing

The immediately prior PR #157 head proved typecheck, 272 test files / 1,951 tests, and the 16/16 offline AI intent eval; its release guard failed only because no release note existed. This change must rerun the queue validators, release guard, and exact-head CI/review before merge.
