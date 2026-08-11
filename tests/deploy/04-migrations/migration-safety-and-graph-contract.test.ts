import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const read = (relativePath: string) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
const stripSqlComments = (sql: string) => sql
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/--.*$/gm, "");

describe("[04-migrations] migration concurrency safety", () => {
  const runner = read("scripts/apply-migrations.mjs");
  const safety = read("scripts/migration-safety.mjs");
  const drizzlePush = read("scripts/drizzle-push.mjs");
  const contentionVerifier = read("scripts/verify-migration-contention.mjs");

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
    expect(drizzlePush).toContain("PGOPTIONS: migrationPgOptions");
    expect(drizzlePush).toContain("PGCONNECT_TIMEOUT");
  });

  it("serializes numbered migrations and Drizzle pushes with the same bounded coordinator", () => {
    expect(safety).toContain("pg_try_advisory_lock");
    expect(safety).toContain("pg_advisory_unlock");
    expect(safety).not.toMatch(/\bpg_advisory_lock\s*\(/);
    expect(runner).toContain("acquireMigrationCoordinator");
    expect(runner).toContain("releaseMigrationCoordinator");
    expect(drizzlePush).toContain("acquireMigrationCoordinator");
    expect(drizzlePush).toContain("releaseMigrationCoordinator");
    expect(contentionVerifier).toContain("MIGRATION_COORDINATION_TIMEOUT_MS: \"750\"");
    expect(contentionVerifier).toContain('"scripts/drizzle-push.mjs"');
    expect(contentionVerifier).toContain("refusing migration contention proof against non-loopback database host");
  });

  it("acquires coordinators before numbered migration metadata and Drizzle schema push", () => {
    const migrationLockIdx = runner.indexOf("const coordination = await acquireMigrationCoordinator");
    const trackingIdx = runner.indexOf('CREATE TABLE IF NOT EXISTS "applied_sql_migrations"');
    const fileQueryIdx = runner.indexOf("await client.query(sql)");
    expect(migrationLockIdx).toBeGreaterThan(-1);
    expect(trackingIdx).toBeGreaterThan(migrationLockIdx);
    expect(fileQueryIdx).toBeGreaterThan(trackingIdx);

    const pushLockIdx = drizzlePush.indexOf("const coordination = await acquireMigrationCoordinator");
    const pushIdx = drizzlePush.indexOf("code = runDrizzlePush");
    expect(pushLockIdx).toBeGreaterThan(-1);
    expect(pushIdx).toBeGreaterThan(pushLockIdx);
  });

  it("does not add a global transaction wrapper around migrations", () => {
    expect(runner).not.toMatch(/client\.query\(["'`]BEGIN["'`]\)/);
  });

  it("parses every new migration safety executable with Node", () => {
    for (const relativePath of [
      "scripts/migration-safety.mjs",
      "scripts/apply-migrations.mjs",
      "scripts/drizzle-push.mjs",
      "scripts/verify-migration-contention.mjs",
      "scripts/ensure-task-property-graph.mjs",
    ]) {
      const result = spawnSync(process.execPath, ["--check", path.join(repoRoot, relativePath)], {
        cwd: repoRoot,
        encoding: "utf8",
      });
      expect(result.status, `${relativePath}: ${result.stderr}`).toBe(0);
    }
  });
});

describe("[04-migrations] task graph projection and PostgreSQL 19 native graph gate", () => {
  const migration = read("migrations/0044_task_dependency_graph_projection.sql");
  const installer = read("scripts/ensure-task-property-graph.mjs");
  const compose = read("docker-compose.yml");
  const workflow = read(".github/workflows/test-and-attest.yml");

  it("keeps the automatic migration compatible with the current PostgreSQL 16 baseline", () => {
    expect(compose).toContain("postgres:16-alpine");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.task_graph_vertices");
    expect(migration).toContain("CREATE OR REPLACE VIEW public.task_graph_edges");
    expect(migration).toContain("jsonb_array_elements_text");
    expect(stripSqlComments(migration)).not.toMatch(/\bCREATE\s+PROPERTY\s+GRAPH\b/i);
    expect(workflow).toContain("Verify PostgreSQL 19 graph gate skips on PG16 baseline");
  });

  it("normalizes graph identity endpoints to one exact text equality type", () => {
    expect(migration).toContain("id::text AS id");
    expect(migration).toContain("source.id::text AS source_task_id");
    expect(migration).toContain("dependency.target_task_id::text AS target_task_id");
    expect(migration).toContain("target.id::text = dependency.target_task_id");
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
    expect(installer).toMatch(/PROPERTIES \(\s*id,/);
  });

  it("reuses the migration airlock and validates projection relation kinds before native graph DDL", () => {
    const airlockIdx = installer.indexOf("enforceNativeGraphAirlock();");
    const coordinatorIdx = installer.indexOf("const coordination = await acquireMigrationCoordinator");
    const relationCheckIdx = installer.indexOf("FROM pg_catalog.pg_class AS c");
    const ddlIdx = installer.indexOf("await client.query(CREATE_PROPERTY_GRAPH_SQL)");
    expect(installer).toContain("migration-airlock.mjs");
    expect(installer).toContain("--skip-airlock");
    expect(installer).toContain("pg_catalog.pg_namespace");
    expect(installer).toContain('relkind !== "v"');
    expect(airlockIdx).toBeGreaterThan(-1);
    expect(coordinatorIdx).toBeGreaterThan(airlockIdx);
    expect(relationCheckIdx).toBeGreaterThan(coordinatorIdx);
    expect(ddlIdx).toBeGreaterThan(relationCheckIdx);
  });

  it("makes native graph installation idempotent and coordinates it with migrations", () => {
    expect(installer).toContain("information_schema.property_graphs");
    expect(installer).toContain("already exists");
    expect(installer).toContain("acquireMigrationCoordinator");
    expect(installer).toContain("releaseMigrationCoordinator");
  });

  it("proves the PostgreSQL 19 beta graph in an isolated CI service", () => {
    expect(workflow).toContain("postgres19-property-graph");
    expect(workflow).toContain("postgres:19beta2-alpine");
    expect(workflow).toContain("--require-supported");
    expect(workflow).toContain("GRAPH_TABLE (");
    expect(workflow).toContain("graph-ci-source");
    expect(workflow).toContain("graph-ci-target");
    expect(workflow).toContain("expected one native dependency traversal");
  });
});
