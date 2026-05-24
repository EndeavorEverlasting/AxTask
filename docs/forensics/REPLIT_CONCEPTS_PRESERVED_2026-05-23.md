# Replit Concepts Preserved for Follow-Up PRs

Date: 2026-05-23  
Branch: harvest/axtask-replit-rescue-2026-05-23

## Purpose

This document preserves Replit-discovered concepts that should not be lost during the rescue/harvest process.

Some rescued code changes were intentionally not merged because they used local type stubs or no-op persistence fallbacks. Those implementations were not production-grade. The concepts behind them are valid and should be brought forward through proper implementation PRs.

## Concepts Preserved

### 1. Shared Schema Export Gaps

Current typecheck failures indicate that several application concepts are used by client/server code but are not exported from `@shared/schema`.

Missing or unresolved exported types:

- `Survey`
- `SurveyResponse`
- `TaskAttachment`
- `ForumPost`
- `ForumComment`
- `ForumVote`
- `FeedbackClassification`

Observed affected files include:

- `client/src/components/survey-prompt.tsx`
- `client/src/components/task-attachments.tsx`
- `client/src/pages/community-post.tsx`
- `server/engines/nodeweaver-engine.ts`

#### Required follow-up

Create a dedicated schema/DTO PR that does one of the following:

1. Exports the proper inferred schema types from `@shared/schema`, or
2. Moves public client-safe DTOs into an explicit shared DTO module, similar to `shared/public-client-dtos.ts`, or
3. Creates narrow module-local types only where the data is truly local and not shared across API boundaries.

Do not patch this by scattering duplicate local type stubs across UI/server files.

## 2. NodeWeaver Feedback Persistence Gap

`server/engines/nodeweaver-engine.ts` expects feedback classification persistence through:

- `storeFeedbackClassification`

Current storage does not expose that function.

The rescue branch attempted to avoid the failure by dynamically checking storage and returning `null` if the function was missing. That implementation was intentionally rejected because it silently drops persistence.

#### Required follow-up

Create a dedicated NodeWeaver persistence PR that adds real storage support for feedback classifications.

Minimum expected work:

- Add or confirm the backing table/migration for feedback classifications.
- Add `storeFeedbackClassification` to `server/storage`.
- Add retrieval/update helpers if required by existing NodeWeaver comments.
- Ensure `processFeedbackItem` either persists successfully or fails explicitly.
- Add contract/unit tests proving classification persistence works.

Do not merge silent no-op persistence.

## 3. Full Typecheck Blocker

The harvest branch currently has known typecheck blockers unrelated to the safe Pass 2 changes.

Known classification:

`PREEXISTING_TYPECHECK_FAILURE_SHARED_SCHEMA_EXPORTS`

Representative errors:

- `Module '"@shared/schema"' has no exported member 'Survey'.`
- `Module '"@shared/schema"' has no exported member 'TaskAttachment'.`
- `Module '"@shared/schema"' has no exported member 'ForumPost'.`
- `Module '"@shared/schema"' has no exported member 'ForumComment'.`
- `Module '"@shared/schema"' has no exported member 'ForumVote'.`
- `Module '"@shared/schema"' has no exported member 'SurveyResponse'.`
- `Module '"@shared/schema"' has no exported member 'FeedbackClassification'.`
- `Property 'storeFeedbackClassification' does not exist on type 'typeof import("server/storage")'.`

## 4. Rejected Rescue Implementations, Preserved as Concepts

The following rescue diffs were not harvested as implementation:

- `client/src/components/survey-prompt.tsx`
  - Rejected because it replaced a shared `Survey` import with a local stub.
- `client/src/components/task-attachments.tsx`
  - Rejected as a whole because it replaced `TaskAttachment` import with a local stub.
  - The separate null-safe lightbox fix was accepted.
- `client/src/pages/community-post.tsx`
  - Rejected because it replaced forum schema imports with local `ForumPost`, `ForumComment`, and `ForumVote` stubs.
- `server/engines/nodeweaver-engine.ts`
  - Rejected because it replaced schema imports with local stubs and changed missing persistence into a silent no-op.
- `client/src/lib/task-list-search-source.ts`
  - Rejected because the diff was whitespace-only.

## 5. Accepted Harvest Items

Accepted into this harvest PR:

- Rescue/proof documentation.
- Additive offline skill tree migration.
- Billing bridge pip `--no-user` hardening.
- Legacy `task-list.tsx` removal after import checks showed active use of `TaskListHost`.
- Attachment lightbox null-path hardening.

## Recommended PR Sequence

### PR 1: Current Harvest PR

Branch:

`harvest/axtask-replit-rescue-2026-05-23`

Purpose:

- Preserve rescue proof.
- Bring safe migration and cleanup forward.
- Preserve follow-up concepts in documentation.
- Avoid merging low-quality Replit scaffolding.

### PR 2: Shared Schema / DTO Export Repair

Suggested branch:

`fix/shared-schema-export-gaps-2026-05-23`

Purpose:

- Resolve missing shared exports.
- Remove need for local UI/server type stubs.
- Restore full typecheck path.

### PR 3: NodeWeaver Persistence Completion

Suggested branch:

`feature/nodeweaver-feedback-persistence-2026-05-23`

Purpose:

- Add real persistence for feedback classifications.
- Implement `storeFeedbackClassification`.
- Add tests proving classifications are stored and retrievable.

## Acceptance Criteria for Follow-Up Work

- No local duplicate schema stubs unless explicitly justified.
- No silent no-op persistence.
- `npm run check` passes or remaining failures are newly classified with proof.
- Targeted tests pass for affected surfaces.
- Storage/API behavior is covered by tests.
