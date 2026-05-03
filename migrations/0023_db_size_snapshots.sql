-- Phase: granular DB storage console.
--
-- `db_size_snapshots` holds a daily rollup of Postgres disk usage so the
-- admin Storage tab can render a real trend line without polling
-- `pg_database_size` on every request. The retention-prune worker writes
-- one row per 24h sweep, bounded by `DEFAULT_RETENTION_WINDOWS
-- .dbSizeSnapshotsDays` (365 days, see server/workers/retention-prune.ts).
--
-- Columns:
--   db_size_bytes    — pg_database_size(current_database()) at capture time
--   domain_bytes_json — { core, tasks, gamification, ops, unknown } byte totals,
--                       matching the Phase F-1 schema split (shared/schema/*).
--                       Stored as jsonb so we can add/remove domains without a
--                       migration.
--
-- Idempotent: safe to re-run against a DB that already has this table.

CREATE TABLE IF NOT EXISTS db_size_snapshots (
  id                serial PRIMARY KEY,
  captured_at       timestamptz NOT NULL DEFAULT now(),
  db_size_bytes     bigint NOT NULL,
  domain_bytes_json jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS db_size_snapshots_captured_at_idx
  ON db_size_snapshots (captured_at DESC);
