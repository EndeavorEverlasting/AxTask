# Agent notes (AxTask)

## Git / releases

- Do not push experimental work directly to the remote branch that tracks **production deploy**; use a feature branch and a PR. See [docs/GIT_BRANCHING_AND_DEPLOYMENT.md](docs/GIT_BRANCHING_AND_DEPLOYMENT.md).

## Database / schema

- Edit Drizzle models in [`shared/schema.ts`](shared/schema.ts) and config in [`drizzle.config.ts`](drizzle.config.ts). Run **`npm run db:push`** when the database must match schema changes (Drizzle sync).
- For ordered, repeatable DDL (new columns/tables, backfills), add **`migrations/*.sql`** and rely on [`scripts/apply-migrations.mjs`](scripts/apply-migrations.mjs) (tracks `applied_sql_migrations`).
- **Deploy:** Docker and Compose already chain **`apply-migrations.mjs`** then **`drizzle-kit push`** before starting the server—see [`Dockerfile`](Dockerfile) and [`docker-compose.yml`](docker-compose.yml).
- **Single reference for command order and paths:** [docs/DEV_DATABASE_AND_SCHEMA.md](docs/DEV_DATABASE_AND_SCHEMA.md).
