# Migration automation

Use these after restore + `npm run db:push` on **`integration/migration-unified`** (tip **U**). See also [PRODUCTION_DB_MIGRATION_STRATEGY.md](PRODUCTION_DB_MIGRATION_STRATEGY.md) and [STAGING_CUTOVER_RUNBOOK.md](STAGING_CUTOVER_RUNBOOK.md).

## Numbered SQL + Drizzle push (automatic)

`npm run db:push` runs **`npm run migrate:sql` first**, then `drizzle-kit push`.

- **[`scripts/run-sql-migrations.mjs`](../scripts/run-sql-migrations.mjs)** applies each file in [`migrations/`](../migrations/) (lexical order) **once** per database, recording filenames in `applied_sql_migrations` (see [`shared/schema.ts`](../shared/schema.ts)).
- **Dev / production start:** [`tools/local/dev-with-db-push.mjs`](../tools/local/dev-with-db-push.mjs) and [`scripts/start-with-db-push.mjs`](../scripts/start-with-db-push.mjs) call `npm run db:push`, so you normally **do not** run `psql -f migrations/…` by hand.
- **Docker:** [`docker-compose.yml`](../docker-compose.yml) `migrate` uses `db:push:and-seed-docker`, which includes `db:push`, so SQL migrations run there too.
- **Escape hatches:** `SKIP_DB_PUSH_ON_START=true` skips both SQL migrations and Drizzle push on app start (unchanged). `SKIP_SQL_MIGRATIONS=1` skips only the SQL step but still runs `drizzle-kit push` when you use `npm run db:push`.
- **Direct `drizzle-kit push`:** bypasses numbered SQL; prefer `npm run db:push` or `npm run migrate:sql && drizzle-kit push` if you invoke Drizzle manually.

## npm scripts

| Script | Purpose |
|--------|---------|
| `npm run migrate:sql` | Apply pending `migrations/*.sql` only (loads `.env` for `DATABASE_URL`). |
| `npm run migration:verify-schema` | Confirms all Drizzle app tables exist in `DATABASE_URL` (fails if any missing). |
| `npm run migration:smoke-api` | `GET /health` and `GET /ready` on `BASE_URL` (default `http://localhost:5000`). |
| `npm run migration:check` | Runs schema verify if `DATABASE_URL` set; prints reminders for `npm test`, `npm run build`, smoke. |
| `npm run migration:check:full` | Schema verify + `npm test` (`RUN_TESTS=1` via script). |

## User rewards unique index (`ux_user_rewards_user_reward`)

If `npm run db:push` fails when creating the unique index `ux_user_rewards_user_reward` (duplicate `(user_id, reward_id)` rows), dedupe first:

- **Automatic path:** `migrate:sql` runs [migrations/0000_dedupe_user_rewards.sql](../migrations/0000_dedupe_user_rewards.sql) before `drizzle-kit push` whenever that file has not yet been applied to this database.
- **Script:** `npm run migration:dedupe-user-rewards` (Node helper; same intent as 0000) — still used by `npm run db:push:with-dedupe` after `migrate:sql`.
- **Manual SQL:** Rarely needed; open the file only if you are debugging outside `npm run db:push`.

The catalog unique index is declared in `shared/schema.ts` on `userRewards` with a comment pointing at the same script.

## PowerShell (backup / restore)

Requires [PostgreSQL client tools](https://www.postgresql.org/download/) (`pg_dump`, `pg_restore`) on PATH.

```powershell
$env:DATABASE_URL = "postgresql://..."   # source prod (read credentials from host dashboard)
.\scripts\migration\pg-backup.ps1 -OutFile .\backups\axtask-pre-cutover.dump

# Target staging (empty DB)
.\scripts\migration\pg-restore.ps1 -DatabaseUrl "postgresql://..." -BackupFile .\backups\axtask-pre-cutover.dump

cd <AxTask>
npm run db:push
npm run migration:verify-schema
npm run build
npm test
npm run dev   # then in another terminal:
npm run migration:smoke-api
```

## CI / Coderabbit

- **Coderabbit**: address review comments on the feature PR; re-run `npm run build` and `npm test` after fixes.
- **Optional CI job**: `npm run migration:check:full` with a disposable Postgres service and `DATABASE_URL` — only if you add a workflow; schema verify needs a real DB.

## Manual feature passes (not fully automatable)

After automated checks: log in, collaborators, admin migration tab, planner, voice bar, premium/MFA paths — track in [STAGING_CUTOVER_RUNBOOK.md](STAGING_CUTOVER_RUNBOOK.md).
