#!/usr/bin/env node
/**
 * One-off containment for api_request telemetry pressure.
 *
 * This command installs/verifies only the database trigger that rejects new
 * security_events rows with event_type='api_request'. It intentionally:
 *   - defaults to read-only dry-run
 *   - does NOT delete historical rows
 *   - does NOT run the general migration runner
 *   - does NOT modify applied_sql_migrations
 *   - does NOT start the application
 *   - never logs DATABASE_URL
 *
 * Usage:
 *   node scripts/db-contain-api-request.mjs
 *   node scripts/db-contain-api-request.mjs --execute --confirm=CONTAIN_API_REQUEST --prod
 *
 * Non-loopback mutation additionally requires --force-production.
 */

import pgModule from "pg";
const pg = pgModule.default || pgModule;

const args = parseArgs(process.argv.slice(2));
const execute = args.has("execute");
const confirm = args.get("confirm");
const isProd = args.has("prod") || process.env.NODE_ENV === "production";
const forceProduction = args.has("force-production");
const jsonOutput = args.has("json");

function parseArgs(argv) {
  const map = new Map();
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const eq = raw.indexOf("=");
    if (eq === -1) map.set(raw.slice(2), true);
    else map.set(raw.slice(2, eq), raw.slice(eq + 1));
  }
  return {
    get: (key) => map.get(key),
    has: (key) => map.has(key),
  };
}

function isLoopbackDatabase(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  } catch {
    return false;
  }
}

function log(...values) {
  if (!jsonOutput) console.error(...values);
}

function assertMutationAuthorized(url) {
  if (!execute) return;
  if (confirm !== "CONTAIN_API_REQUEST") {
    throw new Error(
      "refusing containment mutation without --confirm=CONTAIN_API_REQUEST",
    );
  }
  if (!isProd) {
    throw new Error("refusing containment mutation without --prod (or NODE_ENV=production)");
  }
  if (!isLoopbackDatabase(url) && !forceProduction) {
    throw new Error(
      "refusing non-loopback containment mutation without --force-production",
    );
  }
}

async function readTriggerState(client) {
  const { rows } = await client.query(
    `SELECT tgname, tgenabled
       FROM pg_trigger
      WHERE tgrelid = 'public.security_events'::regclass
        AND tgname = 'trg_suppress_api_request_security_events'
        AND NOT tgisinternal`,
  );
  if (rows.length === 0) return { exists: false, enabled: false, code: null };
  return {
    exists: true,
    enabled: rows[0].tgenabled !== "D",
    code: rows[0].tgenabled,
  };
}

async function installContainment(client) {
  await client.query("BEGIN");
  try {
    await client.query(`
      CREATE OR REPLACE FUNCTION suppress_api_request_security_events()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.event_type = 'api_request' THEN
          RETURN NULL;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await client.query(
      "DROP TRIGGER IF EXISTS trg_suppress_api_request_security_events ON public.security_events",
    );
    await client.query(`
      CREATE TRIGGER trg_suppress_api_request_security_events
      BEFORE INSERT ON public.security_events
      FOR EACH ROW
      EXECUTE FUNCTION suppress_api_request_security_events()
    `);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  assertMutationAuthorized(url);

  log(
    `[contain-api-request] dry_run=${!execute} target=${isLoopbackDatabase(url) ? "loopback" : "non-loopback"}`,
  );

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    const before = await readTriggerState(client);
    if (!execute) {
      const report = {
        dryRun: true,
        before,
        wouldInstallOrRepairTrigger: !before.exists || !before.enabled,
        deletesHistoricalRows: false,
        updatesMigrationLedger: false,
      };
      if (jsonOutput) console.log(JSON.stringify(report, null, 2));
      else log(`[contain-api-request] trigger exists=${before.exists} enabled=${before.enabled}`);
      return 0;
    }

    await installContainment(client);
    const after = await readTriggerState(client);
    if (!after.exists || !after.enabled) {
      throw new Error("containment trigger verification failed after installation");
    }

    const report = {
      dryRun: false,
      before,
      after,
      deletesHistoricalRows: false,
      updatesMigrationLedger: false,
    };
    if (jsonOutput) console.log(JSON.stringify(report, null, 2));
    else log("[contain-api-request] VERIFIED: api_request suppression trigger exists and is enabled");
    return 0;
  } finally {
    client.release();
    await pool.end();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(
      `[contain-api-request] fatal: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  });
