# Agent notes (AxTask)

## Pre-push gamification / engagement objectives

Before pushing release branches that touch rewards, classification, feedback, coins, or p-score UX, run the objective-to-code checklist: [docs/OBJECTIVE_CODE_PUSH_CHECKLIST.md](docs/OBJECTIVE_CODE_PUSH_CHECKLIST.md).

## Client-visible privacy

- Anything returned to the SPA can be read in DevTools; use serializers such as `toPublicSessionUser` / `toPublicWallet` / `toPublicCoinTransactions` from [`shared/public-client-dtos.ts`](shared/public-client-dtos.ts), avoid `console.log` of API payloads in production client code, and never attach full `res.json` bodies to HTTP access logs. See [docs/CLIENT_VISIBLE_PRIVACY.md](docs/CLIENT_VISIBLE_PRIVACY.md).

## Git / releases

- Do not push experimental work directly to the remote branch that tracks **production deploy**; use a feature branch and a PR. See [docs/GIT_BRANCHING_AND_DEPLOYMENT.md](docs/GIT_BRANCHING_AND_DEPLOYMENT.md).

## CI polling (agent sessions)

Before watching PR checks, use snapshot polls (`gh pr checks <N> --json name,status,conclusion --jq ...`) or headless `--watch` with an `Await` pattern; **never** pipe a long-running `--watch` into `Select-Object -Last N` or `Select-String` in the foreground — they buffer the whole stream and hang the shell. Full patterns, anti-patterns, and a copy-paste baseline recipe: [docs/CI_POLLING_FOR_AGENTS.md](docs/CI_POLLING_FOR_AGENTS.md).

## Pasted images, GIFs, and composer bodies

- User-composed bodies (collab, community, feedback) use `PasteComposer` on write and `SafeMarkdown` on read. Every write route that accepts `attachmentAssetIds` must cap it at 8, call `linkAttachmentsToOwner`, and pair with a read route that serializes `attachments[]` via `toPublicAttachmentRef`. URL imports and GIFs go through `server/services/attachment-url-fetch.ts` (SSRF-hardened) and `server/services/gif-search.ts` (proxy). Full model: [docs/PASTE_COMPOSER_SECURITY.md](docs/PASTE_COMPOSER_SECURITY.md).

## Owner coin grants (operator policy)

Discretionary AxCoin credits are **owner-allowlisted** only (`OWNER_COIN_GRANT_USER_IDS`), audited (`owner_coin_grant` / `logSecurityEvent`), and **not** a generic admin “print money” action. Read the full policy before changing this area: [docs/OPERATOR_COIN_GRANTS.md](docs/OPERATOR_COIN_GRANTS.md).

## Archetype empathy analytics

Archetype-level analytics layered on the existing feedback-with-avatars pipeline. Signals are written with `hashedActor = HMAC-SHA256(ARCHETYPE_ANALYTICS_SALT, userId)` to `security_events (event_type='archetype_signal')`, rolled up daily into `archetype_rollup_daily` + `archetype_markov_daily`, and exposed via read APIs gated by admin session or `ARCHETYPE_READ_TOKEN`. Rollup tables must never carry a user column. Full model (privacy, empathy formula, Markov contract, env vars): [docs/ARCHETYPE_EMPATHY_ANALYTICS.md](docs/ARCHETYPE_EMPATHY_ANALYTICS.md).

## Module layout (current + target)

- Today the domain weight lives in a handful of monoliths (`server/routes.ts`, `server/storage.ts`, `shared/schema.ts`, `client/src/pages/admin.tsx`, `client/src/components/task-list.tsx`, `client/src/components/task-form.tsx`). The per-domain target folder layout (and a phase-by-phase status matrix) is captured in [docs/MODULE_LAYOUT.md](docs/MODULE_LAYOUT.md). Physical splits must go through one monolith per PR, preserving the old file as a barrel so existing imports keep working.

## Database / schema

- Edit Drizzle models in [`shared/schema.ts`](shared/schema.ts) and config in [`drizzle.config.ts`](drizzle.config.ts). Run **`npm run db:push`** when the database must match schema changes (Drizzle sync).
- For ordered, repeatable DDL (new columns/tables, backfills), add **`migrations/*.sql`** and rely on [`scripts/apply-migrations.mjs`](scripts/apply-migrations.mjs) (tracks `applied_sql_migrations`).
- **Deploy:** Docker and Compose chain **`apply-migrations.mjs`** then **`drizzle-kit push`** before the server ([`Dockerfile`](Dockerfile), [`docker-compose.yml`](docker-compose.yml)). **Render / `npm run start`** uses [`scripts/production-start.mjs`](scripts/production-start.mjs) for the same order (`start:app` skips migrations—avoid in prod).
- **Single reference for command order and paths:** [docs/DEV_DATABASE_AND_SCHEMA.md](docs/DEV_DATABASE_AND_SCHEMA.md).
