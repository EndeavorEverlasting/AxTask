# Candidate Review Triage - 2026-05-04

> Historical audit snapshot preserved from the Replit harvest train. Current implementation and status must be reverified against `main`; this document records decisions, not present-day proof.

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
| CAND-005 | Manual | `client/src/pages/messages.tsx` | Candidate replaced E2EE DM implementation with plaintext message flow. | P0/P1 | Restored | E2EE/security posture must not regress silently. | Re-run objective contracts and check/build. |
| CAND-006 | Manual | `client/src/components/share-dialog.tsx` | Candidate removed MFA-gated community publish/unpublish, public-handle invite flow, suggestions, and offline sync handling. | P1/P2 | Restored | Sharing/collaboration security and offline behavior are active user workflows. | Add focused share-dialog regression tests later. |
| CAND-007 | Manual | `client/src/pages/planner.tsx` | Candidate removed planner timeline/Gantt, bundle scoping, AI execute, reminder/grocery, and local insight features. | P2 | Restored | Active planner workflows should not be removed inside a broad candidate without explicit product decision. | Consider factoring planner changes into a separate branch. |
| CAND-008 | Manual | `server/engagement-rewards.ts` / `server/use-case-engagement.contract.test.ts` | Candidate changed engagement reward reason strings/caps and removed contract assertions. | P2/P3 | Restored | Reward identifiers and contract coverage should stay stable unless intentionally migrated. | Separate economy migration required if changing reason strings. |
| CAND-009 | Manual | `server/engines/nodeweaver-engine.ts` | Candidate added local type stubs and a no-op fallback when `storeFeedbackClassification` was missing. | P3 | Accepted temporarily | At the time, shared schema/storage gaps prevented a safe restore. | Reverify current NodeWeaver persistence; do not reintroduce silent no-op persistence. |
| CAND-010 | Manual | `client/src/components/task-form.tsx`, sidebar, tutorial, CSS | Candidate removed ShareDialog context props, Trash nav, newer tutorial content, and base/tutorial CSS utilities. | P2/P3 | Restored | These were rollback-shaped UI/workflow regressions. | Keep focused UI contracts active. |
| CAND-011 | Manual | `scripts/post-merge.sh` | Candidate set `AIRLOCK_BOOTSTRAP_ALLOWED=true` by default before `db:push`. | P1 | Restored | Migration/backup airlock should not be bypassed by default. | Keep emergency bypass explicit only. |
| CAND-012 | Manual | survey, community, NodeWeaver files | Candidate used local type stubs where shared schema exports were absent. | P3 | Accepted temporarily | Shared export gaps existed at the time. | Superseded by focused shared DTO repair; do not scatter duplicate stubs. |
| CAND-013 | Manual | `client/src/components/task-attachments.tsx` | Candidate added local attachment type stub and guarded lightbox path with null fallback. | P3/P4 | Partially accepted | The null guard is safe; the local type stub is not needed on current main. | Preserve only the null guard. |
| CAND-014 | Manual | `tools/billing_bridge/setup-python.mjs` | Candidate added pip `--no-user` during venv dependency install. | P4 | Accepted | Prevents accidental user-site installs; low risk inside venv setup. | Monitor postinstall behavior. |
| CAND-015 | Manual | `client/src/components/task-list.tsx` | Candidate deleted legacy TaskList file. | P3 | Accepted | No live imports remained; `/tasks` and `/shopping` use TaskListHost. | Already absent on current main. |
| CAND-016 | Manual | broad docs set | Candidate carried broad docs churn unrelated to candidate safety. | P4/P5 | Restore recommended | Reduce PR noise and keep candidate focused. | Preserve only reviewed audit records. |
