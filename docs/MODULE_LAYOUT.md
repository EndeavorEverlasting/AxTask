# AxTask module layout (current + target)

This document describes AxTask's module layout — both how it is today, and
the per-domain target that the `chore/perf-refactor-sweep` branch is
migrating toward. It is meant for agents and humans who need to add a
feature or extract a subsystem without breaking back-compat.

AxTask is a single-root npm package. There are no workspaces. The layout
below is **logical only** — folders and barrel re-exports create a
domain-oriented surface on top of the existing monoliths, without changing
`package.json` or module resolution for current callers.

---

## Current monoliths

Four files carry most of the domain weight today. Keeping them working is a
hard constraint; any "split" must preserve the original import paths as
barrels for the duration of the migration.

| File | Lines (approx) | Role |
| --- | --- | --- |
| `server/routes.ts` | ~6100 | All HTTP routes; builds and returns the Express app. Single `registerRoutes(app)` export. |
| `server/storage.ts` | ~4400 | All database reads/writes. Many top-level `export async function` symbols. |
| `shared/schema.ts` | ~1250 | Drizzle table defs, Zod input schemas, inferred types (used by client and server). |
| `client/src/pages/admin.tsx` | ~2150 | Admin SPA page — tabs for live analytics, usage/storage, performance, intel, feedback, appeals, invoicing, users, logs, migration, engineering. |
| `client/src/components/task-list.tsx` | ~1700 | Task-list view used across dashboard + pages. |
| `client/src/components/task-form.tsx` | ~1260 | Task create/edit form. |

These files are cited in `AGENTS.md`, `docs/DEV_DATABASE_AND_SCHEMA.md`,
`docs/PASTE_COMPOSER_SECURITY.md`, and dozens of tests. They are not going
anywhere; the target layout re-exports from them.

---

## Target module layout

### `shared/schema/` (was `shared/schema.ts`)

Goal: one file per domain, each one pgTable/Zod schema/type group.

```
shared/schema/
  index.ts                     # re-exports the whole public surface
  auth.ts                      # users, passwordResetTokens, register/login schemas
  security.ts                  # securityLogs, securityEvents, securityAlerts
  notifications.ts             # userNotificationPreferences, userPushSubscriptions, prefs schemas
  voice.ts                     # userVoicePreferences
  adherence.ts                 # userAdherenceState, userAdherenceInterventions
  tasks.ts                     # tasks, insertTaskSchema, updateTaskSchema
  collaboration.ts             # taskCollaborators, collaborationInboxMessages
  study.ts                     # studyDecks, studyCards, studySessions, studyReviewEvents
  gamification.ts              # wallets, coinTransactions, userBadges, rewardsCatalog, userRewards
  offline.ts                   # offlineGenerators, offlineSkillNodes, userOfflineSkills
  avatars.ts                   # avatarSkillNodes, userAvatarSkills, userAvatarProfiles
  storage.ts                   # usageSnapshots, storagePolicies, attachmentAssets, messageAttachments
  invoicing.ts                 # invoices, invoiceEvents, mfaChallenges, billingPaymentMethods, idempotencyKeys
  premium.ts                   # premiumSubscriptions, premiumSavedViews, premiumReviewWorkflows, premiumInsights, premiumEvents
  community.ts                 # communityPosts, communityReplies
  classification.ts            # taskClassificationConfirmations, userClassificationLabels, taskClassificationThumbs,
                               # classificationContributions, classificationConfirmations, classificationDisputes, categoryReviewTriggers
  patterns.ts                  # taskPatterns
  archetype.ts                 # archetypeRollupDaily, archetypeMarkovDaily
```

**Back-compat rule:** `shared/schema.ts` stays as a one-line re-export
`export * from "./schema/index";` when we do the move, so every
`import { users } from "@shared/schema"` keeps working unchanged.

### `server/storage/` (was `server/storage.ts`)

Goal: one file per domain matching the schema split, plus a few operational
files that don't fit a table.

```
server/storage/
  index.ts                     # re-exports the whole surface
  users.ts                     # createUser, findOrCreateOAuthUser, reset/lockout, ban, getAllUsers
  notifications.ts             # notification + voice + push dispatch + adherence helpers
  security.ts                  # logSecurityEvent, appendSecurityEvent, getSecurityLogs/Events/Alerts,
                               # analyzeAndCreateSecurityAlerts, feedback inbox + insights
  classification.ts            # listUserClassificationLabels, addUserClassificationLabel, dispute helpers
  tasks.ts                     # task CRUD, reorder, bulk moves
  study.ts                     # deck/card/session helpers
  gamification.ts              # wallet, addCoins/spendCoins, transactions, streaks, combo chains, rewards
  offline.ts                   # offline generator ticking
  avatars.ts                   # avatar + skill helpers
  storage-assets.ts            # attachmentAssets / messageAttachments (incl. the new batched helpers:
                               #   getAttachmentsForOwnersBatch, getAttachmentsForOwnersPublicBatch)
  usage.ts                     # usageSnapshots, storagePolicies, capacity rollups
  invoicing.ts                 # invoice issuing, payment methods, idempotency keys
  community.ts                 # post + reply helpers
  collaboration.ts             # collaboration inbox / task collaborators
  archetype.ts                 # archetype rollup queries
  diagnostics.ts               # economy diagnostics, admin snapshots
```

**Back-compat rule:** `server/storage.ts` becomes
`export * from "./storage/index";`. Route handlers keep importing from
`./storage` and get the full surface. Tests using private fixtures from
storage continue to work.

**Note on the Phase E batched helpers:** `getAttachmentsForOwnersBatch`
and `getAttachmentsForOwnersPublicBatch` (added in this branch) live in
`server/storage.ts` today and will migrate to `server/storage/storage-assets.ts`
when the physical split lands. They are already the preferred entry point
for any route that fans out across more than one `ownerId`.

### `server/routes/` (was `server/routes.ts`)

The routes monolith is different in shape from storage/schema: it has one
top-level export (`registerRoutes(app)`) and the rest is a waterfall of
`app.get/post/put/delete` calls that share local closures. Splitting it
safely requires extracting per-domain **route registrars** that each take
the Express app and the shared middlewares.

```
server/routes/
  index.ts                     # registerRoutes(app) — orchestrator that calls registrars in order
  _shared.ts                   # requireAuth, requireAdmin, rate limiters, http utils used across files
  auth.ts                      # /api/auth/* (login, register, logout, mfa, password reset)
  account.ts                   # /api/account/* (prefs, voice, security questions)
  tasks.ts                     # /api/tasks, /api/tasks/:id/* (classification, thumbs, disputes)
  study.ts                     # /api/study/*
  gamification.ts              # /api/wallet, /api/coins, /api/rewards, /api/badges
  offline.ts                   # /api/offline/*
  avatars.ts                   # /api/avatars/*
  community.ts                 # /api/public/community/*, /api/community/*  (uses getAttachmentsForOwnersPublicBatch)
  collaboration.ts             # /api/collaboration/*  (uses getAttachmentsForOwnersBatch)
  attachments.ts               # /api/attachments/*, url-fetch, gif-search
  invoicing.ts                 # /api/invoices/*, /api/billing-bridge/*
  admin.ts                     # /api/admin/*
  archetype.ts                 # /api/archetype/*
  health.ts                    # /health, /ready
  errors.ts                    # 404 handler, error classifier
```

**Why this is staged as follow-up:** the current `registerRoutes`
registers an exact order of Express middleware, static handlers, sessions,
and per-route rate limiters. Re-ordering or extracting any of that wrong
will cause subtle auth/CSRF/rate-limit regressions. A proper migration
must:

1.  Land the `server/routes/_shared.ts` first with the middlewares factored
    out (but `registerRoutes` still calls them in the same order).
2.  Extract one domain file at a time behind a feature-flag-free barrel.
3.  Keep every existing integration test green between extractions.

### Client component split

```
client/src/pages/admin/
  index.tsx                    # current admin.tsx, thin tabs shell
  tabs/
    live-analytics-tab.tsx
    usage-storage-tab.tsx
    performance-tab.tsx        # already contains <ClientPerfPanel /> + API heuristics (phase H shipped)
    intel-tab.tsx
    feedback-tab.tsx
    appeals-tab.tsx
    invoicing-tab.tsx
    users-tab.tsx
    logs-tab.tsx
    migration-tab.tsx
    engineering-tab.tsx

client/src/components/tasks/
  task-list/
    index.tsx                  # was task-list.tsx
    task-row.tsx
    task-list-filters.tsx
    task-list-empty.tsx
  task-form/
    index.tsx                  # was task-form.tsx
    task-form-fields.tsx
    task-form-classification.tsx
    task-form-attachments.tsx
```

**Back-compat rule:** `@/pages/admin` and `@/components/task-list`,
`@/components/task-form` resolve to the new `index.tsx` via folder
resolution. Deep imports continue to work because the existing file names
stay as barrel stubs (e.g. `admin.tsx` becomes `export * from "./admin";`).

---

## What landed on `chore/perf-refactor-sweep`

| Phase | Status | Notes |
| --- | --- | --- |
| A — Vite manualChunks + visualizer + vitest env split | **Shipped** | See `vite.config.ts`, `vitest.config.ts`, `tools/perf/bundle-budget.mjs`. |
| B — Route-level `React.lazy` in `App.tsx` | **Shipped** | 22 non-critical pages lazy-loaded; 6 critical pages stay eager. Contract test at `client/src/app-route-lazy.contract.test.ts`. |
| E — N+1 attachment fixes | **Shipped** | Community post replies and collaboration inbox now use the new batched helpers. |
| H — Admin Performance tab FPS + long-task panel | **Shipped** | `useFpsSampler` + `ClientPerfPanel` at the top of the Admin > Performance tab. |
| J — Deployment test suite + DB-capacity gate | **Shipped** | `tests/deploy/**`, `scripts/deploy/**`, `docs/DEPLOYMENT_TEST_SUITE.md`. Directly prevents the Neon 512 MB migration-time failure class. |
| C — `server/routes.ts` split | **Staged (docs only)** | Target layout above; full physical split is follow-up PR scope. |
| D — `server/storage.ts` split | **Staged (docs only)** | Target layout above; phase E batched helpers already live in storage.ts awaiting migration. |
| F — `shared/schema.ts` split | **Staged (docs only)** | Target layout above; module-resolution safety requires the physical split to land in one atomic commit, not barrel stubs. |
| G — admin.tsx / task-list.tsx / task-form.tsx split | **Staged (docs only)** | Target layout above. |
| I — docs (this file, AGENTS.md link) | **Shipped** | This document. |

---

## Migration rules for the follow-up PRs

When doing the physical splits in later PRs:

1.  **One monolith per PR.** Do not mix `server/storage.ts` and
    `server/routes.ts` extractions — the review surface and blast radius
    are already large.

2.  **Preserve the original file as a barrel.** After the move, the old
    file must be a one-liner:

    ```ts
    // server/storage.ts
    export * from "./storage/index";
    ```

    Callers that import `./storage` (and there are many in
    `server/routes.ts`, tests, and services) keep working unchanged.

3.  **No behavioral change in a split PR.** If a function needs
    refactoring, do it in a separate commit *after* the split lands. The
    split PR should only move code.

4.  **Run `tests/deploy` on every split PR.** The deployment test suite
    exists precisely to catch "we forgot a file" regressions during
    refactors — specifically, the artifact + contract tests.

5.  **Keep `AGENTS.md` links pointing at the monolith paths** until the
    split PR lands. After the split, update `AGENTS.md` to point at the
    new per-domain paths in the same PR.

---

## Cross-references

- [`AGENTS.md`](../AGENTS.md) — rules referenced by all agents.
- [`docs/DEPLOYMENT_TEST_SUITE.md`](DEPLOYMENT_TEST_SUITE.md) — what Phase J builds and why.
- [`docs/DEV_DATABASE_AND_SCHEMA.md`](DEV_DATABASE_AND_SCHEMA.md) — db:push vs migrations ordering (referenced by the test suite).
- [`docs/GIT_BRANCHING_AND_DEPLOYMENT.md`](GIT_BRANCHING_AND_DEPLOYMENT.md) — feature-branch + PR policy.
