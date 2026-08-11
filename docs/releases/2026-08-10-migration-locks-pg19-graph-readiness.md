# Migration lock safety and PostgreSQL 19 graph readiness — 2026-08-10

## Scope

This release hardens AxTask's SQL migration runner against lock pileups and concurrent migration processes, while preparing task dependencies for PostgreSQL SQL/PGQ property graphs without upgrading the database or changing durable task storage.

## Migration concurrency safety

`scripts/apply-migrations.mjs` now applies bounded, session-level database settings before any migration metadata or migration SQL is touched:

- `MIGRATION_LOCK_TIMEOUT_MS` — default `5000`
- `MIGRATION_STATEMENT_TIMEOUT_MS` — default `900000`
- `MIGRATION_IDLE_IN_TX_TIMEOUT_MS` — default `60000`
- `MIGRATION_CONNECTION_TIMEOUT_MS` — default `10000`
- `MIGRATION_COORDINATION_TIMEOUT_MS` — default `30000`
- `MIGRATION_COORDINATION_RETRY_MS` — default `250`

Only one AxTask SQL migration runner may make migration decisions at a time. The runner uses `pg_try_advisory_lock` with bounded retries rather than a blocking advisory-lock call. The coordinator is acquired before creating/reading `applied_sql_migrations` and held until migration files and metadata writes finish.

Existing migration files keep ownership of their transaction boundaries. The runner deliberately does not wrap every file in a new transaction because existing migrations can contain their own `BEGIN`/`COMMIT`.

## Task dependency graph projection

Migration `0044_task_dependency_graph_projection.sql` creates two read-only relational views:

- `public.task_graph_vertices` — live, non-deleted task vertices.
- `public.task_graph_edges` — directed `source_task_id -> target_task_id` dependency edges expanded from `tasks.depends_on`.

Edges are constrained to matching users and ignore soft-deleted endpoints. This projection is compatible with the current PostgreSQL 16 baseline and is useful for ordinary relational graph queries today.

## Native PostgreSQL property graph

`scripts/ensure-task-property-graph.mjs` is an explicit opt-in installer. It checks `server_version_num` before any SQL/PGQ DDL:

- PostgreSQL < 19: prints a safe skip and leaves the relational views available.
- PostgreSQL 19+: coordinates with the migration runner, verifies projection views, checks `information_schema.property_graphs`, and creates `public.axtask_task_dependencies` once.
- `--require-supported`: turns an unsupported server into a failing gate for upgrade certification.

The native graph maps `task_graph_vertices` as task vertices and `task_graph_edges` as directed `depends_on` edges. It does not copy task data or replace PostgreSQL relational storage.

## Non-goals / safety boundary

This release does **not**:

- upgrade Docker, Neon, Render, or any production database to PostgreSQL 19;
- run native graph DDL during application startup;
- modify production retention/recovery data;
- normalize or rewrite task dependency data;
- change authentication/session storage;
- change product UI behavior.

## Operator proof

Current-baseline proof:

```bash
npm run test:deploy:migrations
CI=true DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/axtask_test node scripts/apply-migrations.mjs
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/axtask_test node scripts/ensure-task-property-graph.mjs
```

On PostgreSQL 16, the last command must report a native-graph skip, not attempt `CREATE PROPERTY GRAPH`. PostgreSQL 19 certification must rerun it with `--require-supported` and then prove a `GRAPH_TABLE` query before claiming native graph runtime proof.
