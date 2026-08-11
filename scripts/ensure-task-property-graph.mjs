#!/usr/bin/env node
/**
 * Opt-in PostgreSQL 19 SQL/PGQ property-graph installer for task dependencies.
 *
 * This is deliberately not part of automatic startup migrations. AxTask's
 * current local/runtime baseline remains PostgreSQL 16; the relational graph
 * projection is installed by migrations and this command adds only the native
 * PostgreSQL 19 graph definition when the connected server supports it.
 *
 * Usage:
 *   DATABASE_URL=... node scripts/ensure-task-property-graph.mjs
 *   DATABASE_URL=... node scripts/ensure-task-property-graph.mjs --require-supported
 */
import pgModule from "pg";
const pg = pgModule.default || pgModule;
import {
  acquireMigrationCoordinator,
  configureMigrationSession,
  migrationSafetyConfig,
  releaseMigrationCoordinator,
} from "./migration-safety.mjs";

const MIN_PROPERTY_GRAPH_VERSION = 190000;
const GRAPH_SCHEMA = "public";
const GRAPH_NAME = "axtask_task_dependencies";

const CREATE_PROPERTY_GRAPH_SQL = `
CREATE PROPERTY GRAPH public.axtask_task_dependencies
  VERTEX TABLES (
    public.task_graph_vertices AS task
      KEY (id)
      LABEL task
      PROPERTIES (
        user_id,
        activity,
        status,
        priority,
        classification,
        start_date,
        end_date,
        deadline_type,
        created_at,
        updated_at
      )
  )
  EDGE TABLES (
    public.task_graph_edges AS dependency
      KEY (source_task_id, target_task_id)
      SOURCE KEY (source_task_id) REFERENCES task (id)
      DESTINATION KEY (target_task_id) REFERENCES task (id)
      LABEL depends_on
      PROPERTIES (user_id, relation)
  );
`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const requireSupported = process.argv.includes("--require-supported");
  const safety = migrationSafetyConfig();
  const pool = new pg.Pool({
    connectionString: url,
    max: 1,
    connectionTimeoutMillis: safety.connectionTimeoutMs,
  });
  let client;
  let coordinatorAcquired = false;

  try {
    client = await pool.connect();
    const { rows: versionRows } = await client.query(
      "SELECT current_setting('server_version_num')::integer AS server_version_num, version() AS version",
    );
    const serverVersionNum = Number(versionRows[0]?.server_version_num);
    const serverVersion = versionRows[0]?.version ?? "unknown";

    if (!Number.isInteger(serverVersionNum)) {
      throw new Error(`could not determine PostgreSQL server_version_num (${serverVersion})`);
    }
    if (serverVersionNum < MIN_PROPERTY_GRAPH_VERSION) {
      const message =
        `[graph] SKIP native property graph requires PostgreSQL 19+; connected server is ${serverVersion}`;
      if (requireSupported) throw new Error(message);
      console.log(message);
      console.log("[graph] relational views remain available: public.task_graph_vertices, public.task_graph_edges");
      return;
    }

    await configureMigrationSession(client, safety);
    const coordination = await acquireMigrationCoordinator(client, safety);
    coordinatorAcquired = true;
    console.log(
      `[graph] migration coordinator acquired attempts=${coordination.attempts} waited=${coordination.waitedMs}ms`,
    );

    const { rows: sourceRows } = await client.query(
      `SELECT
         to_regclass('public.task_graph_vertices') AS vertices,
         to_regclass('public.task_graph_edges') AS edges`,
    );
    if (!sourceRows[0]?.vertices || !sourceRows[0]?.edges) {
      throw new Error("task graph projection views are missing; run scripts/apply-migrations.mjs first");
    }

    const { rows: existing } = await client.query(
      `SELECT 1
         FROM information_schema.property_graphs
        WHERE property_graph_schema = $1
          AND property_graph_name = $2`,
      [GRAPH_SCHEMA, GRAPH_NAME],
    );
    if (existing.length > 0) {
      console.log(`[graph] already exists: ${GRAPH_SCHEMA}.${GRAPH_NAME}`);
      return;
    }

    await client.query(CREATE_PROPERTY_GRAPH_SQL);
    console.log(`[graph] created native property graph: ${GRAPH_SCHEMA}.${GRAPH_NAME}`);
  } finally {
    if (client && coordinatorAcquired) {
      try {
        await releaseMigrationCoordinator(client);
      } catch (err) {
        console.error(`[graph] coordinator release warning: ${err.message}`);
      }
    }
    if (client) client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(`[graph] fatal: ${err.message}`);
  process.exit(1);
});
