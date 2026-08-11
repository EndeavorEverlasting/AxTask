# Migration lock safety and PostgreSQL 19 graph readiness — 2026-08-10

## Scope

This release hardens AxTask's SQL migration runner and Drizzle schema push against lock pileups and concurrent deployment processes, while preparing task dependencies for PostgreSQL SQL/PGQ property graphs without upgrading the application database or changing durable task storage.

## Diagnosis

The previous deployment chain protected backup/capacity gates but left database waits effectively unbounded and allowed separate deployment processes to enter schema-changing phases at the same time. Numbered SQL migrations and the follow-on Drizzle push were independent processes, so protecting only one phase would still leave a schema race. Task dependencies also lived only in `tasks.depends_on`, which was queryable relationally but had no graph projection or version-gated SQL/PGQ path.

The repair therefore treats **numbered migrations, Drizzle schema push, and native property-graph DDL as one schema-change coordination domain**. Each command uses the same advisory lock keys and bounded acquisition loop. Drizzle child database sessions also receive session defaults for lock, statement, and idle-transaction timeouts through `PGOPTIONS`.

## Migration concurrency safety

`scripts/apply-migrations.mjs` and `scripts/drizzle-push.mjs` now apply bounded database settings:

- `MIGRATION_LOCK_TIMEOUT_MS` — default `5000`
- `MIGRATION_STATEMENT_TIMEOUT_MS` — default `900000`
- `MIGRATION_IDLE_IN_TX_TIMEOUT_MS` — default `60000`
- `MIGRATION_CONNECTION_TIMEOUT_MS` — default `10000`
- `MIGRATION_COORDINATION_TIMEOUT_MS` — default `30000`
- `MIGRATION_COORDINATION_RETRY_MS` — default `250`

Only one AxTask schema-changing command may execute inside these managed paths at a time. Coordination uses `pg_try_advisory_lock` with bounded retries rather than a blocking advisory-lock call. The numbered migration runner acquires the coordinator before creating/reading `applied_sql_migrations`; the Drizzle wrapper acquires the same coordinator before spawning `drizzle-kit`. The forced production-start path now calls the coordinated wrapper instead of invoking `drizzle-kit` directly. Docker Compose already routes its post-migration push through `npm run db:push`, so that phase is coordinated as well.

`scripts/verify-migration-contention.mjs` supplies executable fail-fast proof on disposable loopback databases: it holds the coordinator, requires both a competing numbered migration and a Drizzle push to fail within the bounded coordination timeout, releases the lock, then requires both commands to recover successfully. The verifier refuses non-loopback database hosts.

Existing migration files keep ownership of their transaction boundaries. The runner deliberately does not wrap every file in a new transaction because existing migrations can contain their own `BEGIN`/`COMMIT`.

```mermaid
flowchart TD
  A[Schema-changing command] --> B[Backup / capacity policy if applicable]
  B --> C[Configure session timeouts]
  C --> D{Try shared advisory coordinator}
  D -->|busy; budget remains| D
  D -->|coordination timeout| E[Fail closed before schema mutation]
  D -->|acquired| F{Command type}
  F -->|numbered SQL| G[Apply pending migrations + metadata]
  F -->|Drizzle| H[Spawn push with PGOPTIONS timeouts]
  F -->|PG19 graph| I[Validate projection views + create property graph]
  G --> J[Release advisory coordinator]
  H --> J
  I --> J
  J --> K[Continue deployment / certification]
```

## Task dependency graph projection

Migration `0044_task_dependency_graph_projection.sql` creates two read-only relational views:

- `public.task_graph_vertices` — live, non-deleted task vertices.
- `public.task_graph_edges` — directed `source_task_id -> target_task_id` dependency edges expanded from `tasks.depends_on`.

Edges are constrained to matching users and ignore soft-deleted endpoints. This projection is compatible with the current PostgreSQL 16 baseline and is useful for ordinary relational graph queries today.

## Native PostgreSQL property graph

`scripts/ensure-task-property-graph.mjs` is an explicit opt-in installer. It checks `server_version_num` before any SQL/PGQ DDL:

- PostgreSQL < 19: prints a safe skip and leaves the relational views available.
- PostgreSQL 19+: runs the existing migration backup airlock, acquires the shared schema-change coordinator, requires both graph projection sources to be ordinary views, checks `information_schema.property_graphs`, and creates `public.axtask_task_dependencies` once.
- `--require-supported`: turns an unsupported server into a failing gate for upgrade certification.

The native graph maps `task_graph_vertices` as task vertices and `task_graph_edges` as directed `depends_on` edges. It does not copy task data or replace PostgreSQL relational storage.

PostgreSQL 19 is still a beta line at the time of this release. CI therefore tests it only in a disposable `postgres:19beta2-alpine` service. The application/local runtime baseline remains PostgreSQL 16. The beta job installs the real property graph and executes a `GRAPH_TABLE` traversal over two temporary task rows inside a rolled-back transaction.

## Rollout

1. Merge only after the PostgreSQL 16 migration/bootstrap job, bounded contention verifier, PostgreSQL 16 graph-skip gate, and disposable PostgreSQL 19 native graph job all pass on the exact PR head.
2. Existing PostgreSQL 16 environments receive only the relational graph views plus migration/Drizzle coordination. They do not execute native graph DDL.
3. Keep normal production startup on the existing `SKIP_DB_PUSH_ON_START=true` posture where configured. If an operator deliberately enables startup Drizzle push, it now uses `scripts/drizzle-push.mjs --force` and the shared coordinator.
4. Treat PostgreSQL 19 production adoption as a separate major-version migration after GA, provider support, backup/restore proof, and `--require-supported` certification. Do not infer production readiness from the beta CI job.

## Rollback

- Code rollback: revert this release; existing task rows and `depends_on` JSONB remain authoritative and unchanged.
- PostgreSQL 16 projection rollback, if explicitly needed: drop only `public.task_graph_edges` and `public.task_graph_vertices` after verifying no consumers depend on them. No task data rollback is required because the views do not own data.
- PostgreSQL 19 native graph rollback: `DROP PROPERTY GRAPH public.axtask_task_dependencies;` removes the logical graph definition without deleting underlying task data. Leave the relational views in place unless a separate dependency check authorizes removing them.
- Timeout rollback: restore prior environment values or remove `MIGRATION_*_TIMEOUT_MS` overrides to return to repository defaults; do not disable coordination to work around contention.
- If a timeout starts firing during an actual migration, diagnose the blocking session/DDL and retry after the blocker clears rather than increasing limits blindly.

## Testing

Required exact-head proof:

- `npm run test:deploy:migrations` — static/contract coverage, including executable-SQL comment stripping and coordinator ordering.
- PostgreSQL 16 full migration bootstrap and second Drizzle convergence pass.
- `node scripts/verify-migration-contention.mjs` — observed bounded failure for both numbered migrations and Drizzle while the coordinator is held, followed by successful recovery.
- `node scripts/ensure-task-property-graph.mjs` on PostgreSQL 16 — observed safe version skip.
- disposable `postgres:19beta2-alpine` CI — full schema/bootstrap, `--require-supported` native graph creation, and observed `GRAPH_TABLE` traversal.
- full repository typecheck, unit/integration tests, production build, Docker build, UI regression, migration idempotency, and local production certification.

## Non-goals / safety boundary

This release does **not**:

- upgrade Docker Compose, Neon, Render, or any production database to PostgreSQL 19;
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
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/axtask_test node scripts/verify-migration-contention.mjs
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/axtask_test node scripts/ensure-task-property-graph.mjs
```

On PostgreSQL 16, the last command must report a native-graph skip, not attempt native property-graph DDL. PostgreSQL 19 certification requires `--require-supported` plus an observed `GRAPH_TABLE` dependency traversal before claiming native graph runtime proof. Production adoption remains a separate major-version migration decision after PostgreSQL 19 reaches an approved release and provider support is proven.
