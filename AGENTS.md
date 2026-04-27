# Agent notes (AxTask)

## Pre-push gamification / engagement objectives

Before pushing release branches that touch rewards, classification, feedback, coins, or p-score UX, run the objective-to-code checklist: [docs/OBJECTIVE_CODE_PUSH_CHECKLIST.md](docs/OBJECTIVE_CODE_PUSH_CHECKLIST.md).

## Freemium / premium economics and Pretext-first UI

Do not regress the AxCoin + subscription model or the Pretext-vs-React split without updating the canonical note: [docs/FREEMIUM_PREMIUM_AND_PRETEXT.md](docs/FREEMIUM_PREMIUM_AND_PRETEXT.md).

## Calendar holidays

Per-user overlay for public holidays (Nager + Western Easter merge), `GET`/`PATCH` `/api/calendar/preferences`, and `GET` `/api/calendar/public-holidays`. See [docs/CALENDAR_HOLIDAYS.md](docs/CALENDAR_HOLIDAYS.md).

## Task list UX contract

Do not remove header sorting/filtering from `TaskListHost`; this is a required `/tasks` UX contract documented at [docs/TASK_LIST_INTERACTION_CONTRACT.md](docs/TASK_LIST_INTERACTION_CONTRACT.md).

## Scroll / calm-mode visual stability (Pretext + glass)

Before changing `data-axtask-calm` rules, `.glass-panel*`, Pretext ambient chips, app scroll roots, sidebar chrome, or the planner **TaskGantt** SVG, read [docs/SCROLL_REFRESH_VISUAL_STABILITY.md](docs/SCROLL_REFRESH_VISUAL_STABILITY.md). It documents hue-flash and Gantt text-stretch failure modes and the **chrome vs content** split (`.axtask-nav-chrome` vs glass reader surfaces).

**Canonical doc:** the full incident summary, architecture diagram, symptom matrix, refresh-vs-calm distinction, debugging playbook, and verification commands live only in **`docs/SCROLL_REFRESH_VISUAL_STABILITY.md`**—keep that file the single long-form source; cross-link here and from perf/debug indexes rather than duplicating prose in AGENTS.md.

## Performance budgets

CI enforces client bundle size (`npm run perf:bundle`) and API latency heuristics (`npm run perf:api-replay`) on every PR. Tightening a budget requires bumping the paired fixture/test; loosening requires an operator-visible note in the PR. Full map of budgets, signals, fixtures, and runtime knobs: [docs/PERF_PERFORMANCE_BUDGETS.md](docs/PERF_PERFORMANCE_BUDGETS.md).

## Client-visible privacy

- Anything returned to the SPA can be read in DevTools; use serializers such as `toPublicSessionUser` / `toPublicWallet` / `toPublicCoinTransactions` from [`shared/public-client-dtos.ts`](shared/public-client-dtos.ts), avoid `console.log` of API payloads in production client code, and never attach full `res.json` bodies to HTTP access logs. See [docs/CLIENT_VISIBLE_PRIVACY.md](docs/CLIENT_VISIBLE_PRIVACY.md).

## Git / releases

- Do not push experimental work directly to the remote branch that tracks **production deploy**; use a feature branch and a PR. See [docs/GIT_BRANCHING_AND_DEPLOYMENT.md](docs/GIT_BRANCHING_AND_DEPLOYMENT.md).
- **Branch names:** use `{type}/{YYYY-MM-DD}-{concrete-slug}` (date + what actually changed), not generic names like `hygiene` or `wip`. Full rationale and examples: [Branch names (time and context)](docs/GIT_BRANCHING_AND_DEPLOYMENT.md#branch-names-time-and-context) in that doc.

### Agent session completion (deployable work)

- When changes are meant for **deploy or review on the current remote branch** (feature branch, working branch, or the branch Render/your pipeline tracks), treat **`git commit` + `git push` to `origin/<current-branch>`** as part of the same deliverable as the code change—not a separate optional step. Prefer **`npm run ship -- "conventional message"`** (runs [`scripts/ship.ps1`](scripts/ship.ps1)) so staging, commit, and push stay one command.
- **Skip push** only when the user explicitly asked for **local-only / no remote** work (WIP handoff, spike, or “do not push”).
- Still obey the production-branch rule above: never bypass **feature branch + PR** for production-track deploys.

## CI polling (agent sessions)

Before watching PR checks, use snapshot polls (`gh pr checks <N> --json name,status,conclusion --jq ...`) or headless `--watch` with an `Await` pattern; **never** pipe a long-running `--watch` into `Select-Object -Last N` or `Select-String` in the foreground — they buffer the whole stream and hang the shell. Full patterns, anti-patterns, and a copy-paste baseline recipe: [docs/CI_POLLING_FOR_AGENTS.md](docs/CI_POLLING_FOR_AGENTS.md).

## Pasted images, GIFs, and composer bodies

- User-composed bodies (collab, community, feedback) use `PasteComposer` on write and `SafeMarkdown` on read. Every write route that accepts `attachmentAssetIds` must cap it at 8, call `linkAttachmentsToOwner`, and pair with a read route that serializes `attachments[]` via `toPublicAttachmentRef`. URL imports and GIFs go through `server/services/attachment-url-fetch.ts` (SSRF-hardened) and `server/services/gif-search.ts` (proxy). Full model: [docs/PASTE_COMPOSER_SECURITY.md](docs/PASTE_COMPOSER_SECURITY.md).

## Owner coin grants (operator policy)

Discretionary AxCoin credits are **owner-allowlisted** only (`OWNER_COIN_GRANT_USER_IDS`), audited (`owner_coin_grant` / `logSecurityEvent`), and **not** a generic admin “print money” action. Read the full policy before changing this area: [docs/OPERATOR_COIN_GRANTS.md](docs/OPERATOR_COIN_GRANTS.md).

## Admin access model

`role === "admin"` is assigned **out of band** (no self-service promote route in the API inventory); production MFA step-up applies to most `/api/admin/*` routes, with documented exceptions (e.g. export/import). Full diagram and file pointers: [docs/ADMIN_ACCESS_MODEL.md](docs/ADMIN_ACCESS_MODEL.md).

## Archetype empathy analytics

Archetype-level analytics layered on the existing feedback-with-avatars pipeline. Signals are written with `hashedActor = HMAC-SHA256(ARCHETYPE_ANALYTICS_SALT, userId)` to `security_events (event_type='archetype_signal')`, rolled up daily into `archetype_rollup_daily` + `archetype_markov_daily`, and exposed via read APIs gated by admin session or `ARCHETYPE_READ_TOKEN`. Rollup tables must never carry a user column. Full model (privacy, empathy formula, Markov contract, env vars): [docs/ARCHETYPE_EMPATHY_ANALYTICS.md](docs/ARCHETYPE_EMPATHY_ANALYTICS.md).

## Module layout (current + target)

- Today the domain weight lives in a handful of monoliths (`server/routes.ts`, `server/storage.ts`, `shared/schema.ts`, `client/src/pages/admin.tsx`, `client/src/components/task-list.tsx`, `client/src/components/task-form.tsx`). The per-domain target folder layout (and a phase-by-phase status matrix) is captured in [docs/MODULE_LAYOUT.md](docs/MODULE_LAYOUT.md). Physical splits must go through one monolith per PR, preserving the old file as a barrel so existing imports keep working.

## Database / schema

- Edit Drizzle models in [`shared/schema.ts`](shared/schema.ts) and config in [`drizzle.config.ts`](drizzle.config.ts). Run **`npm run db:push`** when the database must match schema changes (Drizzle sync).
- For ordered, repeatable DDL (new columns/tables, backfills), add **`migrations/*.sql`** and rely on [`scripts/apply-migrations.mjs`](scripts/apply-migrations.mjs) (tracks `applied_sql_migrations`).
- **Deploy:** Docker and Compose chain **`apply-migrations.mjs`** then **`drizzle-kit push`** before the server ([`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml)). **Render / `npm run start`** uses [`scripts/production-start.mjs`](scripts/production-start.mjs) for the same order (`start:app` skips migrations—avoid in prod).
- **Single reference for command order and paths:** [docs/DEV_DATABASE_AND_SCHEMA.md](docs/DEV_DATABASE_AND_SCHEMA.md). For **Neon vs local Postgres**, app settings vs `DATABASE_URL`, and which scripts load `.env`, read [App settings vs `DATABASE_URL`](docs/DEV_DATABASE_AND_SCHEMA.md#app-settings-vs-database_url-important) in that doc. Local SQL migrations with `.env` loaded: **`npm run db:migrate`**.
- **Environment variable catalog** (VAPID, OAuth, NodeWeaver, `VITE_*`, deploy knobs): [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md).
- **Retention windows for audit / append-only / derived tables:** [docs/DB_RETENTION_POLICY.md](docs/DB_RETENTION_POLICY.md). New append-only tables must be added to both the policy table and `RETENTION_WINDOWS` in [`scripts/db-retention.mjs`](scripts/db-retention.mjs) in the same PR. Maintenance tooling: [`scripts/db-size-audit.mjs`](scripts/db-size-audit.mjs) (read-only) and [`scripts/db-reclaim.mjs`](scripts/db-reclaim.mjs) (`--confirm=YES --prod`; VACUUM FULL).
