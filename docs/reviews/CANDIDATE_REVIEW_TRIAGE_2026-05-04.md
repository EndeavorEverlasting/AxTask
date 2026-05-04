# Candidate Review Triage - 2026-05-04

Branch: candidate/2026-05-04-replit-code-only  
Target: main

## Triage Rules

- P0: Security, auth, data loss, database corruption.
- P1: Build, deployment, migration, startup failure.
- P2: Runtime regression or broken user workflow.
- P3: Test coverage, edge cases, unclear behavior.
- P4: Maintainability and refactor suggestions.
- P5: Style, naming, formatting, low-value polish.

## Review Table

| ID | Tool | File / Line | Summary | Priority | Decision | Reason | Follow-up |
|---|---|---|---|---|---|---|---|
| R001 | CodeRabbit | TBD | TBD | TBD | Investigate | TBD | TBD |
| R002 | CodeAnt | TBD | TBD | TBD | Investigate | TBD | TBD |

## Accepted Fixes

| Commit | Summary | Linked Review IDs |
|---|---|---|

## Deferred Items

| Review ID | Reason Deferred | Future Branch / Issue |
|---|---|---|

## Rejected Items

| Review ID | Reason Rejected |
|---|---|

| CAND-005 | Manual | client/src/pages/messages.tsx | Candidate replaced E2EE DM implementation with plaintext message flow. | P0/P1 | Restored | E2EE/security posture must not regress silently. | Re-run objective contracts and check/build. |
| CAND-006 | Manual | client/src/components/share-dialog.tsx | Candidate removed MFA-gated community publish/unpublish, public-handle invite flow, suggestions, and offline sync handling. | P1/P2 | Restored | Sharing/collaboration security and offline behavior are active user workflows. | Add focused share-dialog regression tests later. |
| CAND-007 | Manual | client/src/pages/planner.tsx | Candidate removed planner timeline/Gantt, bundle scoping, AI execute, reminder/grocery, and local insight features. | P2 | Restored | Active planner workflows should not be removed inside a broad candidate without explicit product decision. | Consider factoring planner changes into a separate branch. |
| CAND-008 | Manual | server/engagement-rewards.ts / server/use-case-engagement.contract.test.ts | Candidate changed engagement reward reason strings/caps and removed contract assertions. | P2/P3 | Restored | Reward identifiers and contract coverage should stay stable unless intentionally migrated. | Separate economy migration required if changing reason strings. |

| CAND-009 | Manual | server/engines/nodeweaver-engine.ts | Candidate adds local type stubs and a no-op fallback when storeFeedbackClassification is missing. | P3 | Accept temporarily | storeFeedbackClassification and related shared schema types are not present, and no active references to processFeedbackItem were found. Restoring origin/main would likely reintroduce missing imports/exports. | Build real feedback_classifications schema/storage migration before enabling NodeWeaver persistence. |
