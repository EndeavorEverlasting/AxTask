import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

describe("[04-migrations] migration concurrency safety", () => {
  const runner = read("scripts/apply-migrations.mjs");
  const safety = read("scripts/migration-safety.mjs");

  it("bounds connection, lock, statement, idle-transaction, and coordinator waits", () => {
    expect(runner).toContain("connectionTimeoutMillis");
    expect(safety).toContain("MIGRATION_LOCK_TIMEOUT_MS");
    expect(safety).toContain("MIGRATION_STATEMENT_TIMEOUT_MS");
    expect(safety).toContain("MIGRATION_IDLE_IN_TX_TIMEOUT_MS");
    expect(safety).toContain("MIGRATION_COORDINATION_TIMEOUT_MS");
    expect(safety).toContain("MIGRATION_CONNECTION_TIMEOUT_MS");
    expect(safety).toMatch(/set_config\(\$1, \$2, false\)/);
    expect(safety).toContain('"lock_timeout"');
    expect(safety).toContain('"statement_timeout"');
    expect(safety).toContain('"idle_in_transaction_session_timeout"');
  });

  it("serializes migration runners with bounded nonblocking advisory-lock retries", () => {
    expect(safety).toContain("pg_try_advisory_lock");
    expect(safety).toContain("pg_advisory_unlock");
    expect(safety).not.toMatch(/\bpg_advisory_lock\s*\(/);
    expect(runner).toContain("acquireMigrationCoordinator");
    expect(runner).toContain("releaseMigrationCoordinator");
  });

  it("acquires the coordinator before migration metadata and migration files", () => {
    const lockIdx = runner.indexOf("acquireMigrationCoordinator");
    const trackingIdx = runner.indexOf('CREATE TABLE IF NOT EXISTS "applied_sql_migrations"');
    const fileQueryIdx = runner.indexOf("await client.query(sql)");
    expect(lockIdx).toBeGreaterThan(-1);
    expect(trackingIdx).toBeGreaterThan(lockIdx);
    expect(fileQueryIdx).toBeGreaterThan(trackingIdx);
  });

  it("does not add a global transaction wrapper around migrations", () => {
    expect(runner).not.toMatch(/client\.query\(["'`]BEGIN["'`]\)/);
  });
});

describe("[04-migrations] task graph projection and PostgreSQL 19 native graph gate", () => {
  const migration = read("migrations/0044_task_dependency_graph_projection.sql");
  const installer = read("scripts/ensure-task-property-graph.mjs");
  const compose = read("docker-compose.yml");

  it("keeps the automatic migration compatible with the current PostgreSQL 16 baseline", () => {
    expect(compose).toContain("postgres:16-alpine");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.task_graph_vertices");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.task_graph_edges");
    expect(migration).toContain("jsonb_array_elements_text");
    expect(migration).not.toContain("CREATE PROPERTY GRAPH");
  });

  it("prevents cross-user dependency edges in the relational graph projection", () => {
    expect(migration).toMatch(/target\.user_id\s+IS NOT DISTINCT FROM\s+source\.user_id/i);
    expect(migration).toMatch(/source\.deleted_at IS NULL/i);
    expect(migration).toMatch(/target\.deleted_at IS NULL/i);
  });

  it("gates SQL/PGQ property-graph DDL on PostgreSQL 19 or newer", () => {
    expect(installer).toContain("MIN_PROPERTY_GRAPH_VERSION = 190000");
    expect(installer).toContain("server_version_num");
    expect(installer).toContain("--require-supported");
    expect(installer).toContain("CREATE PROPERTY GRAPH public.axtask_task_dependencies");
    expect(installer).toContain("VERTEX TABLES");
    expect(installer).toContain("EDGE TABLES");
    expect(installer).toContain("SOURCE KEY (source_task_id) REFERENCES task (id)");
    expect(installer).toContain("DESTINATION KEY (target_task_id) REFERENCES task (id)");
  });

  it("makes native graph installation idempotent and coordinates it with migrations", () => {
    expect(installer).toContain("information_schema.property_graphs");
    expect(installer).toContain("already exists");
    expect(installer).toContain("acquireMigrationCoordinator");
    expect(installer).toContain("releaseMigrationCoordinator");
  });
});
