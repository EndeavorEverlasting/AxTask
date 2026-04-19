# baseline/published -> main reconciliation audit

Read-only inventory of `origin/baseline/published` against `origin/main`.
Produced on 2026-04-18 (Sat) from branch `docs/baseline-published-audit` off
`origin/main`.

No cherry-picks, merges, or edits to non-markdown files were performed as part
of this audit. The deliverable is this document. Follow-up porting work (if
any) must go through a feature branch + PR per
[AGENTS.md](../AGENTS.md) and
[docs/GIT_BRANCHING_AND_DEPLOYMENT.md](./GIT_BRANCHING_AND_DEPLOYMENT.md).

## 1. Divergence summary

| Branch | Tip SHA | Position |
| --- | --- | --- |
| `origin/main` | `803a3769` | 122 commits ahead of merge base |
| `origin/baseline/published` | `17c7f8ab` | 59 commits ahead of merge base |
| merge base | `b8068c0a` | 2026-03-31 ("Improve dictation input and route persistence") |

Three-dot diff (`origin/main...origin/baseline/published`): **57 files
changed, ~9,660 insertions, ~346 deletions**.

`baseline/published` is the Replit-published stream (Tasks #16 through #25
plus deploy/publish snapshots). `main` is the AxTask deploy target, which has
evolved **independently** for ~18 days along a different track
(paste composer, archetype analytics, release-2026-04-15 / -17 / -18
batches, shopping list, mini-games, skill-tree, video-huddle, billing-bridge,
community-redesign, hotkeys refactor, etc.).

Because both sides have diverged heavily and `main`'s track is the deploy
target, a direct merge would regress several areas. The recommended strategy
is **selective port via feature branches**, not a merge.

## 2. Baseline-only commit inventory

All 59 commits on `origin/baseline/published` that are not on `origin/main`,
in chronological order, grouped by theme. "Tasks #16 .. #25" are the authored
feature tasks; "Published your App" entries are Replit deploy snapshots.

### Tasks #16 -- #19 (priority UX, coins, mobile voice, recurrence, imports, search)

- `81d3ae5` / `aa0c821` / `d1b584c` Task #16: Fix priority calculation glitch & classification discoverability
- `a9c3957` Add highlight mode toggle to task list
- `05d2095` Add highlight mode toggle and ClassificationBadge tests
- `4cee7e0` Improve visibility of pencil icon on classification badge for mobile users
- `6615a5c` Add a system for users to earn coins and badges for collaborating on tasks
- `ce01fa0` Introduce new coin economy features for task management
- `90d5e9b` Create immersive mobile voice experience and fix blank screen issues
- `a91ab11` / `56987e9` / `2213038` / `0101519` / `0e4676e` / `5d3ae53` Task #17: Custom recurrence patterns & cleanup bonus
- `e60d950` Update task update logic to include time changes
- `bab9eee` Update tutorial shortcut to avoid browser conflict
- `8120f74` / `dd9a311` / `83333e6` Task #18: Data Migration Toolkit - Duplicate Import Prevention
- `2c6aa63` Improve task import process by preventing duplicate entries
- `a91fc1f` / `a3a7342` / `5c95055` / `f0827cb` / `2d41c6e` / `9ea45d3` / `a4e0d12` / `9eab941` Task #19: Clear+Close safeguard, Ctrl+F global search, sort dropdown fixes
- `76c3f35` Make time field glow yellow when empty on initial form load
- `556800c` Add engaging animations when new tasks are created

### Privacy / Terms / Login polish

- `f2425ec` Make login page more resilient by always showing email/password form
- `a83666c` Add privacy and terms of service pages and links
- `c547584` Add links to privacy and terms on the login page

### Deploy hardening (Replit-focused)

- `229d213` Published your App
- `5843de8` Add automatic handling for port conflicts to prevent server crashes
- `a02e6cb` Add health check endpoint and improve startup logging for deployments
- `7b5cb76` Add pre-publish validation pipeline and fix all 39 TypeScript errors
- `a920ea9` Saved progress at the end of the loop
- `6766696` Improve deployment readiness and validation checks for production
- `ffb0aab` Comprehensive build/deploy documentation and pre-publish hardening
- `f4b59a3` Update application startup and deployment configuration for improved stability
- `b889a9b` Update documentation to clarify deployment port and environment variable rules
- `01ba19c` Add comprehensive Autoscale deployment documentation to replit.md
- `9b276e9` Published your App

### Import reliability / Full Account Backup / MFA / Danger Zone (Tasks #22--#23)

- `fca683c` Improve task import reliability and handle larger files
- `d226fb8` Published your App
- `5aee441` Add Full Account Backup & Restore UI to Import/Export page
- `8e4c37a` Add content-based deduplication to Full Account Backup import
- `a15b86e` Published your App
- `2561124` feat: JSON import support, TOTP MFA infrastructure, and Danger Zone
- `8a01bac` Published your App
- `c97ef05` Published your App
- `8075251` Fix MFA crypto import for production (Task #23)
- `fea0e12` Published your App

### NodeWeaver classification + Community Forum (Tasks #24--#25)

- `163b692` Add classification dispute and consensus system for NodeWeaver
- `66792a9` Add community forum with social feed, comments, voting & moderation (Task #25)
- `29dc6c9` Add emoji reactions to community forum posts and comments
- `17c7f8a` Published your App

## 3. Per-file classification

Size columns are raw line counts (`git show <ref>:<path> | wc -l`). Classification
key:

- **NET-NEW** -- file does not exist on `origin/main`
- **SUPERSEDED** -- file exists on `main` in substantially reworked form (main has its own evolution post-divergence)
- **OVERLAP** -- both sides have evolved; baseline additions may apply if narrow
- **ARTIFACT** -- accidental / non-portable file

### 3a. Client pages

| Path | Main lines | Baseline lines | Classification | Notes |
| --- | ---: | ---: | --- | --- |
| `client/src/pages/privacy.tsx` | -- | 89 | NET-NEW | Standalone privacy page, routed from login. |
| `client/src/pages/terms.tsx` | -- | 110 | NET-NEW | Standalone ToS page, routed from login. |
| `client/src/pages/community-post.tsx` | -- | 442 | NET-NEW (but SUPERSEDED at feature level) | Thread detail view for Task #25 forum. Main already has a redesigned forum (see community.tsx below); this page is probably obsolete. |
| `client/src/pages/community.tsx` | 757 | 307 | **SUPERSEDED** | Main has rewritten this 2x via `community-redesign` branch ("glassmorphic UI", "avatar-driven forum", "orbs driven by archetype personalities", "dialogue engine + moderation"). Do not port baseline version. |
| `client/src/pages/import-export.tsx` | 1023 | 1214 | **SUPERSEDED** (partial overlap) | Baseline adds Full Account Backup + dedup UI. Main reworked the page for coin-gated exports and shared HTTP/offline modules. Backup UI may be worth porting as a narrow addition, not a wholesale replacement. |
| `client/src/pages/login.tsx` | 1132 | 876 | **SUPERSEDED** | Baseline adds email/password fallback + privacy/terms links. Main is significantly larger (probably MFA/step-up/OTP work). The privacy/terms link wiring can be reapplied; the fallback behavior may already exist on main. Needs narrow review. |
| `client/src/pages/admin.tsx` | 2146 | 658 | **SUPERSEDED** | Main has ~3x the admin surface (API perf heuristics, archetype analytics, etc.). Do not port baseline. |
| `client/src/pages/rewards.tsx` | 744 | 549 | **SUPERSEDED** | Main expanded rewards loops + coin accrual visibility (release-2026-04-15). Do not port baseline wholesale. |
| `client/src/pages/analytics.tsx` | 222 | 193 | OVERLAP (trivial) | +3 lines only; likely a single import. Ignorable. |
| `client/src/pages/dashboard.tsx` | 160 | 118 | OVERLAP (trivial) | +3 lines only. |
| `client/src/pages/planner.tsx` | 818 | 724 | OVERLAP (trivial) | +3 lines only. |
| `client/src/pages/tasks.tsx` | 84 | 14 | **SUPERSEDED** | Main page has 6x the surface; baseline's few lines are noise. |

### 3b. Client components

| Path | Main lines | Baseline lines | Classification | Notes |
| --- | ---: | ---: | --- | --- |
| `client/src/components/global-search.tsx` | -- | 170 | NET-NEW | Task #19 Ctrl+F global search dialog. Main has `hotkeys-find-function-4-13-2026` branch that may or may not have implemented this. **Investigate before porting.** |
| `client/src/components/markdown-editor.tsx` | -- | 80 | NET-NEW (but potentially SUPERSEDED) | Main has `PasteComposer` + `SafeMarkdown` per [docs/PASTE_COMPOSER_SECURITY.md](./PASTE_COMPOSER_SECURITY.md). Baseline editor is likely a simpler version already replaced by the PasteComposer pipeline. **Skip unless gap identified.** |
| `client/src/components/mobile-voice-overlay.tsx` | -- | 372 | NET-NEW (likely SUPERSEDED) | Main's `d4fe1ad` "cross-device voice listening preferences and mobile voice entry points" + broader voice refactor (`c5ab6ff`) implements the same feature area. **Investigate before porting.** |
| `client/src/components/survey-prompt.tsx` | -- | 321 | NET-NEW (likely SUPERSEDED) | Main has avatar-tied feedback prompts (`f414fc6` "Tie feedback prompts to avatars and make planner insights clickable"). Baseline survey-prompt likely predates this. **Investigate.** |
| `client/src/components/task-attachments.tsx` | -- | 248 | NET-NEW (likely SUPERSEDED) | Attachments on main go through the PasteComposer + `linkAttachmentsToOwner` + `toPublicAttachmentRef` pipeline (see [docs/PASTE_COMPOSER_SECURITY.md](./PASTE_COMPOSER_SECURITY.md)). Baseline's standalone component is from before that hardening; should **not** be ported as-is. |
| `client/src/components/classification-badge.test.tsx` | -- | 184 | NET-NEW | Standalone test file. Main's `classification-badge.tsx` is 491 lines (vs baseline 165), so tests may be incompatible without adaptation. **Port with adaptation** only if tests map to current badge API. |
| `client/src/components/classification-badge.tsx` | 491 | 165 | **SUPERSEDED** | Main has ~3x the surface. Do not port. |
| `client/src/components/task-form.tsx` | 1258 | 1095 | **SUPERSEDED** | Main reworked for new Task fields (gantt startDate/endDate/durationMinutes/dependsOn per `f9e547e`), hotkeys, etc. |
| `client/src/components/task-list.tsx` | 1688 | 1290 | **SUPERSEDED** | Main has task list guardrails + virtualization (`fe28143`) + highlight mode + hotkeys. Baseline's highlight-mode additions may already be present or reworked. |
| `client/src/components/bulk-action-dialog.tsx` | 365 | 266 | **SUPERSEDED** | Main is larger; baseline trivially touches +4 lines. |
| `client/src/components/share-dialog.tsx` | 462 | 259 | **SUPERSEDED** | Main rewritten; baseline adds +115 lines likely to a smaller version. |
| `client/src/components/layout/sidebar.tsx` | 514 | 325 | **SUPERSEDED** | Main has more nav items (shopping, mini-games, skill-tree, video-huddle, settings). Baseline +6 lines is the privacy/terms/community-post link wiring and should be reapplied surgically if at all. |
| `client/src/components/task-calendar.tsx` | 528 | 496 | OVERLAP (trivial) | +2 lines. |
| `client/src/components/ui/clock-time-picker.tsx` | 362 | 189 | **SUPERSEDED** | Main reworked per `65fd1eb` "full-screen clock picker + auto-submit". |
| `client/src/components/voice-command-bar.tsx` | 290 | 193 | **SUPERSEDED** | Main has `c5ab6ff` centralized chord dispatch + wake-speech hook. |

### 3c. Client hooks / libs

| Path | Main lines | Baseline lines | Classification | Notes |
| --- | ---: | ---: | --- | --- |
| `client/src/lib/pending-edit.ts` | -- | 29 | NET-NEW | Small helper for Clear+Close safeguard (Task #19). **Port candidate** if equivalent not on main. |
| `client/src/lib/priority-engine.ts` | 189 | 201 | OVERLAP | Baseline has the Task #16 priority fix (+27 lines). Main has its own small variant (-12 lines). **Investigate diff before porting.** |
| `client/src/lib/priority-engine.test.ts` | 121 | 162 | OVERLAP | Test expansions that accompany priority fix. Port together with `priority-engine.ts` if the fix still applies. |
| `client/src/hooks/use-mobile.tsx` | 47 | 19 | **SUPERSEDED** | Main is larger. Baseline +9 lines already likely absorbed. |
| `client/src/hooks/use-tutorial.tsx` | 216 | 208 | OVERLAP (trivial) | +6 lines, likely shortcut change (`bab9eee`). |

### 3d. Client root / styles

| Path | Main lines | Baseline lines | Classification | Notes |
| --- | ---: | ---: | --- | --- |
| `client/src/App.tsx` | 426 | 221 | **SUPERSEDED** | Main has many more routes (shopping, mini-games, skill-tree, video-huddle, billing-bridge, settings, etc.). Baseline adds privacy/terms/community-post routes; reapply surgically if porting those pages. |
| `client/src/index.css` | 747 | 304 | **SUPERSEDED** | Main has significantly more styles (glassmorphic community, orb avatars, etc.). Baseline +55 lines likely already covered. |

### 3e. Server

| Path | Main lines | Baseline lines | Classification | Notes |
| --- | ---: | ---: | --- | --- |
| `server/engines/nodeweaver-engine.ts` | -- | 675 | **NET-NEW (investigate)** | TypeScript stub engine for feedback classification (bug/user_error/feature_request/praise/noise). Main's `services/nodeweaver/` folder contains only a README -- the actual NodeWeaver submodule was removed (see `b483268` / `97bcf29`). This engine is the **server-side integration shim** for NodeWeaver classification; it may be worth keeping. Depends on baseline-only schema additions (`ClassificationDispute`, etc.), so porting requires schema work too. |
| `server/fingerprint.ts` | -- | 21 | NET-NEW | Small utility for content-based dedup in Full Account Backup import (`8e4c37a`). **Port candidate** if backup dedup is ported. |
| `server/routes.ts` | 5842 | 2651 | **SUPERSEDED** | Main is ~2.2x the size. Routes for community, MFA, backup, dispute on baseline have no direct equivalent on main but main has its own newer community/MFA/archetype routes. **Do not merge wholesale**; any port is surgical. |
| `server/storage.ts` | 4054 | 1957 | **SUPERSEDED** | Same pattern -- main is 2x. Port nothing wholesale. |
| `shared/schema.ts` | 1181 | 538 | **SUPERSEDED** | Main has added archetype, shopping, avatar skill, push, adherence, gantt (per `f9e547e`) tables. Baseline's +320 lines are community-forum, dispute, MFA, backup tables; any port must avoid colliding with main's merged pattern/classification tables (`e25366e`). |
| `server/migration/import.ts` | 760 | 889 | **SUPERSEDED (partial overlap)** | Baseline adds +155 lines (dedup + larger-file handling). Main has its own route-inventory unification (`a603304`, `4b8358d`). The dedup logic (`fingerprint.ts` pairing) is a **port candidate** if dedup isn't on main. |
| `server/coin-engine.ts` | 204 | 290 | OVERLAP / **investigate** | Baseline adds collaboration coin grants (`6615a5c`) and new coin economy (`ce01fa0`). Main has a smaller file -- some of baseline's coin additions may genuinely be missing. **Investigate before deciding.** |
| `server/engines/dispatcher.ts` | 311 | 260 | OVERLAP / **investigate** | Baseline wires NodeWeaver into dispatch. If nodeweaver-engine.ts is ported, this patch needs to come with it. |
| `server/index.ts` | 347 | 220 | **SUPERSEDED** | Baseline adds port-conflict handler + health-check + startup logging. Main already has production-start + verify-drizzle + bundle-budget. Baseline's port-conflict handling may still be useful. **Narrow review.** |
| `server/auth-providers.ts` | 308 | 300 | OVERLAP (small) | +15 lines; likely the email/password fallback. **Investigate.** |
| `server/auth.ts` | 127 | 107 | OVERLAP (trivial) | +2 lines. |
| `server/checklist-pdf.ts` | 165 | 165 | OVERLAP (trivial) | Same size; likely a 1-2 line change. |
| `server/classification-engine.ts` | 115 | 115 | OVERLAP (trivial) | +1 line. |
| `server/engines/pattern-engine.ts` | 482 | 463 | OVERLAP (trivial) | +3 lines. |
| `server/replit_integrations/auth/replitAuth.ts` | 141 | 141 | OVERLAP (trivial) | +2 lines. |

### 3f. Infra / config

| Path | Main lines | Baseline lines | Classification | Notes |
| --- | ---: | ---: | --- | --- |
| `scripts/pre-publish-check.sh` | -- | 189 | NET-NEW (Replit-specific) | Bash pre-publish validation. Main has `scripts/verify-drizzle-deploy.*` + `production-start.mjs` serving similar purpose. **Skip unless a Replit-specific gate is still needed.** |
| `sedAbATpZ` | -- | 13 | **ARTIFACT -- DO NOT PORT** | Contents are a copy of `.replit`. Almost certainly an accidental `sed` output left behind. Safe to ignore. |
| `.replit` | 38 | 74 | **SUPERSEDED** (irrelevant to main) | Replit config; main runs on Render/Docker. |
| `replit.md` | 69 | 108 | **SUPERSEDED** (Replit-specific) | Skip. |
| `package.json` | 185 | 146 | **SUPERSEDED** | Main has superset of deps. Any baseline-specific deps must be re-evaluated against what's actually on main. |
| `package-lock.json` | 13490 | 14135 | SKIP | Never port a lockfile directly; regenerate if deps are added. |
| `tsconfig.json` | 24 | 25 | OVERLAP (trivial) | +2 lines. |
| `vitest.config.ts` | 19 | 22 | OVERLAP (trivial) | +5 lines. |

## 4. Feature-level recommendations

### 4a. Port (low risk, likely missing on main)

1. **Privacy + Terms of Service pages** (`f2425ec`, `a83666c`, `c547584`)
   - Files: `client/src/pages/privacy.tsx`, `client/src/pages/terms.tsx`, plus the login-page link wiring and sidebar/footer link.
   - Main has neither page. Static content, extremely low conflict risk.
   - Feature branch: `port/baseline-privacy-terms`.

2. **Content-based fingerprint helper** (`8e4c37a`)
   - Files: `server/fingerprint.ts` (NET-NEW).
   - Only if the Full Account Backup dedup feature is also ported. Needs `server/migration/import.ts` surgical patch.
   - Feature branch: `port/baseline-backup-dedup` (bundled with backup UI).

### 4b. Investigate before porting (likely already covered, but may have gaps)

3. **Full Account Backup UI** (`5aee441`, `8e4c37a`)
   - Files: `client/src/pages/import-export.tsx` (partial), `server/migration/import.ts` (partial), `server/fingerprint.ts`.
   - Check whether main's coin-gated productivity exports (`597ec92`, `feat/coin-gated-productivity-exports-part-*`) already provide a Full Account Backup path.
   - If gap confirmed, port surgically as a new UI section; do **not** overwrite main's reworked page.

4. **Task #16 priority engine fix**
   - Files: `client/src/lib/priority-engine.ts`, `client/src/lib/priority-engine.test.ts`.
   - Read `git diff origin/main -- client/src/lib/priority-engine.ts origin/baseline/published -- client/src/lib/priority-engine.ts` and confirm whether the glitch fix was re-implemented on main.
   - Feature branch: `port/baseline-priority-fix` (if gap).

5. **Ctrl+F global search + Clear+Close safeguard** (Task #19)
   - Files: `client/src/components/global-search.tsx` (NET-NEW), `client/src/lib/pending-edit.ts` (NET-NEW), plus chord wiring.
   - Main has `hotkeys-find-function-4-13-2026` branch merged into `main`. Check whether Ctrl+F (find) already dispatches a global search. If so, skip; if not, port the component and wire through main's `c5ab6ff` centralized hotkey dispatch.

6. **Collaboration coin grants + coin economy additions** (`6615a5c`, `ce01fa0`)
   - File: `server/coin-engine.ts` (+184 lines).
   - Main has an owner-allowlisted coin-grant system (per [docs/OPERATOR_COIN_GRANTS.md](./OPERATOR_COIN_GRANTS.md)). Baseline's collaboration-earn mechanic is a **different** feature (user earns coins via collaborating). Check whether this earn-path exists on main; if not, port as a new engine rule.

7. **NodeWeaver TS classification engine + dispute/consensus system** (`163b692`)
   - Files: `server/engines/nodeweaver-engine.ts` (NET-NEW, 675 lines), `server/engines/dispatcher.ts` (wire-in), schema additions for `ClassificationDispute`, `CategoryReviewTrigger`, `SurveyResponse`, `Survey`, `FeedbackClassification`.
   - Main removed the NodeWeaver submodule and left only `services/nodeweaver/README.md`. The TS engine may be the de-facto in-repo classification shim.
   - **Most complex port**: requires schema migrations, dispatcher wiring, and verifying no collisions with main's archetype analytics pipeline. Consider scoping as an explicit project rather than a backport.

8. **TOTP MFA infrastructure + Danger Zone** (`2561124`, `8075251`)
   - Affects `server/auth.ts`, `server/auth-providers.ts`, `shared/schema.ts`, `server/routes.ts`, `client/src/pages/login.tsx`, `client/src/pages/admin.tsx` (possibly via a settings/account page).
   - Main already has extensive auth work (`5b4ea92` SMS/email OTP, step-up sessions, `feature/docker-up-docs-tests` branch docs on MFA, MFA handoff UX `bcf17db`). **High probability this is already covered in a different form on main.** Confirm before porting.

### 4c. Skip -- superseded by main

- **Community forum (Task #25) and emoji reactions (`29dc6c9`)**. Main's `community-redesign` branch is live with avatar-driven orbs, dialogue engine, moderation, and seeded posts -- the baseline forum would regress it.
- **Classification badge rework**. Main is 3x the size of baseline's and has its own test suite.
- **Mobile voice overlay**. Main's voice refactor (`c5ab6ff`, `d4fe1ad`) supersedes baseline.
- **Survey prompt / feedback**. Main has avatar-tied prompts via `f414fc6`.
- **Markdown editor + task attachments**. Main uses `PasteComposer` + `SafeMarkdown` + `linkAttachmentsToOwner` ([docs/PASTE_COMPOSER_SECURITY.md](./PASTE_COMPOSER_SECURITY.md)).
- **Clock time picker**. Main has a full-screen picker (`65fd1eb`).
- **Admin page**. Main is ~3x the size and has archetype/API perf heuristics.
- **Deploy snapshots / `.replit` / `replit.md` / pre-publish-check.sh**. Main targets Render/Docker with its own verify pipeline; Replit configs do not apply.

### 4d. Do not port

- `sedAbATpZ` -- accidental file.
- `package-lock.json` -- regenerate from `package.json` changes only.
- Any trivial +/- 2--6 line drift in files marked "OVERLAP (trivial)" in section 3 unless the change is explicitly associated with a feature to port above.

## 5. Proposed follow-up feature-branch checklist

Proposal only. No branches created in this audit pass. Each line is a
potential follow-up PR; numbers in brackets are the sections above.

- [ ] `port/baseline-privacy-terms` -- 2 NET-NEW pages + login/sidebar link wiring. **Low risk.** [4a #1]
- [ ] `port/baseline-priority-fix` -- priority engine Task #16 fix + tests, only if gap confirmed. **Low risk.** [4b #4]
- [ ] `port/baseline-pending-edit-clear-close` -- `client/src/lib/pending-edit.ts` + task-form wiring for the Clear+Close safeguard. **Low-medium risk.** [4b #5]
- [ ] `port/baseline-global-search` -- `client/src/components/global-search.tsx` wired into main's centralized chord dispatch. **Medium risk** (may duplicate existing hotkey work). [4b #5]
- [ ] `port/baseline-backup-dedup` -- Full Account Backup dedup (UI + server + fingerprint). **Medium risk** (must not regress coin-gated exports). [4b #3]
- [ ] `port/baseline-coin-collab-earn` -- collaboration coin-earn mechanic, only if gap confirmed against main's coin-engine. **Medium risk** ([docs/OPERATOR_COIN_GRANTS.md](./OPERATOR_COIN_GRANTS.md) must be respected). [4b #6]
- [ ] `project/nodeweaver-ts-engine` -- NodeWeaver TS engine + dispute/consensus system. **High risk / large scope** (schema migrations, dispatcher wiring, archetype-analytics compatibility). Treat as a project, not a backport. [4b #7]
- [ ] `audit/mfa-gap-check` -- read-only confirmation that main's MFA/OTP/step-up work covers Task #23. No code port expected. [4b #8]

## 6. Out of scope (explicitly)

- No merges, cherry-picks, or non-markdown edits performed.
- Working tree: uncommitted task-gantt timeline work was already committed to local branch `feat/gantt-timeline-freemium` (commit `f9e547e`) before this audit; local `main` was fast-forwarded to `origin/main` (`803a3769`).
- No pushes; this document lives on branch `docs/baseline-published-audit` off `origin/main`.
