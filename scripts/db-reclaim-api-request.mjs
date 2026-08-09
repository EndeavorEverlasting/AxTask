#!/usr/bin/env node
/**
 * Targeted api_request telemetry cleanup for security_events.
 *
 * Logical cleanup and physical reclaim are deliberately separate operations:
 *
 *   # read-only dry run (default)
 *   node scripts/db-reclaim-api-request.mjs --retention-days=1
 *
 *   # logical cleanup only; each DELETE batch commits independently
 *   node scripts/db-reclaim-api-request.mjs --execute --confirm=YES --prod --retention-days=1
 *
 *   # physical reclaim only; run later in an authorized maintenance window
 *   node scripts/db-reclaim-api-request.mjs --vacuum-full --execute --confirm=VACUUM_FULL --prod
 *
 * SAFETY GATES:
 *   - dry-run by default; --execute is required for mutation
 *   - mutation requires --prod (or NODE_ENV=production)
 *   - non-loopback mutation additionally requires --force-production
 *   - logical cleanup requires --confirm=YES
 *   - physical reclaim requires --vacuum-full AND --confirm=VACUUM_FULL
 *   - VACUUM FULL never runs as a side effect of logical cleanup
 *   - never TRUNCATEs security_events and never drops indexes
 *   - never logs DATABASE_URL, even masked
 *   - deletes only event_type='api_request' rows older than the retention window
 *   - verifies the non-api_request row count is unchanged
 *
 * Env: DATABASE_URL (required)
 */

import pgModule from "pg";
const pg = pgModule.default || pgModule;

const args = parseArgs(process.argv.slice(2));
const execute = args.has("execute");
const dryRun = !execute;
const physicalReclaim = args.has("vacuum-full");
const confirm = args.get("confirm");
const isProd = args.has("prod") || process.env.NODE_ENV === "production";
const forceProduction = args.has("force-production");
const retentionDays = parseIntegerArg(args.get("retention-days") ?? "1", {
  name: "retention-days",
  min: 0,
  max: 3650,
});
const batchSize = parseIntegerArg(args.get("batch-size") ?? "5000", {
  name: "batch-size",
  min: 1,
  max: 50000,
});
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

function parseIntegerArg(raw, { name, min, max }) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`--${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function log(...values) {
  if (!jsonOutput) console.error(...values);
}

function isLoopbackDatabase(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
  } catch {
    return false;
  }
}

function assertMutationAuthorized(url) {
  if (dryRun) return;

  const expectedConfirmation = physicalReclaim ? "VACUUM_FULL" : "YES";
  if (confirm !== expectedConfirmation) {
    throw new Error(
      `refusing mutation: expected --confirm=${expectedConfirmation} for ${physicalReclaim ? "physical reclaim" : "logical cleanup"}`,
    );
  }
  if (!isProd) {
    throw new Error("refusing mutation without --prod (or NODE_ENV=production)");
  }
  if (!isLoopbackDatabase(url) && !forceProduction) {
    throw new Error(
      "refusing non-loopback mutation without --force-production; production writes require explicit operator authorization",
    );
  }
}

async function getCounts(client) {
  const { rows } = await client.query(
    `SELECT
       COUNT(*)::bigint AS total,
       COUNT(*) FILTER (WHERE event_type = 'api_request')::bigint AS api_request_total,
       COUNT(*) FILTER (WHERE event_type IS DISTINCT FROM 'api_request')::bigint AS non_api_request
     FROM security_events`,
  );
  return {
    total: Number(rows[0].total),
    apiRequestTotal: Number(rows[0].api_request_total),
    nonApiRequest: Number(rows[0].non_api_request),
  };
}

async function getEligibleApiRequestCount(client, days) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::bigint AS count
       FROM security_events
      WHERE event_type = 'api_request'
        AND created_at < now() - ($1::int * interval '1 day')`,
    [days],
  );
  return Number(rows[0].count);
}

async function getRelationSize(client) {
  const { rows } = await client.query(
    `SELECT pg_total_relation_size('public.security_events'::regclass)::bigint AS bytes`,
  );
  return Number(rows[0].bytes);
}

async function runBatchedDelete(client, days, size) {
  let totalDeleted = 0;
  let batchNumber = 0;

  while (true) {
    batchNumber += 1;
    // Intentionally no encompassing BEGIN/COMMIT: each bounded DELETE statement
    // commits independently so millions of rows do not become one giant transaction.
    const result = await client.query(
      `DELETE FROM security_events
        WHERE ctid IN (
          SELECT ctid
            FROM security_events
           WHERE event_type = 'api_request'
             AND created_at < now() - ($1::int * interval '1 day')
           LIMIT $2
        )`,
      [days, size],
    );
    const deleted = result.rowCount ?? 0;
    totalDeleted += deleted;
    log(
      `[reclaim-api-request] batch=${batchNumber} deleted=${deleted} total_deleted=${totalDeleted}`,
    );
    if (deleted < size) break;
  }

  return totalDeleted;
}

async function runVacuumFull(client) {
  log(
    "[reclaim-api-request] VACUUM FULL requested explicitly; this requires an exclusive table lock.",
  );
  await client.query("VACUUM FULL public.security_events");
}

function emitReport(report) {
  if (jsonOutput) console.log(JSON.stringify(report, null, 2));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  assertMutationAuthorized(url);

  log(
    `[reclaim-api-request] mode=${physicalReclaim ? "physical-reclaim" : "logical-cleanup"} dry_run=${dryRun} target=${isLoopbackDatabase(url) ? "loopback" : "non-loopback"} retention_days=${retentionDays} batch_size=${batchSize}`,
  );

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();
  try {
    const before = await getCounts(client);
    const eligibleBefore = await getEligibleApiRequestCount(client, retentionDays);
    const sizeBefore = await getRelationSize(client);

    if (dryRun) {
      const report = {
        dryRun: true,
        mode: physicalReclaim ? "physical-reclaim" : "logical-cleanup",
        before: { ...before, eligibleApiRequest: eligibleBefore, relationBytes: sizeBefore },
        wouldDelete: physicalReclaim ? 0 : eligibleBefore,
        wouldVacuumFull: physicalReclaim,
        nonApiRequestPreserved: before.nonApiRequest,
      };
      log(
        physicalReclaim
          ? "[reclaim-api-request] DRY RUN: would run VACUUM FULL only; no rows would be deleted."
          : `[reclaim-api-request] DRY RUN: would delete ${eligibleBefore} eligible api_request rows in batches; VACUUM FULL would NOT run.`,
      );
      emitReport(report);
      return 0;
    }

    if (physicalReclaim) {
      if (eligibleBefore > 0) {
        throw new Error(
          `refusing VACUUM FULL while ${eligibleBefore} eligible api_request rows remain; run logical cleanup first`,
        );
      }
      await runVacuumFull(client);
      const sizeAfter = await getRelationSize(client);
      const after = await getCounts(client);
      if (after.nonApiRequest !== before.nonApiRequest) {
        throw new Error(
          `non-api_request count changed during physical reclaim: before=${before.nonApiRequest} after=${after.nonApiRequest}`,
        );
      }
      emitReport({
        dryRun: false,
        mode: "physical-reclaim",
        before: { ...before, relationBytes: sizeBefore },
        after: { ...after, relationBytes: sizeAfter },
        deleted: 0,
        vacuumFull: true,
      });
      return 0;
    }

    const deleted = await runBatchedDelete(client, retentionDays, batchSize);
    const after = await getCounts(client);
    const eligibleAfter = await getEligibleApiRequestCount(client, retentionDays);
    const sizeAfter = await getRelationSize(client);

    if (after.nonApiRequest !== before.nonApiRequest) {
      throw new Error(
        `non-api_request count changed: before=${before.nonApiRequest} after=${after.nonApiRequest}`,
      );
    }
    if (eligibleAfter !== 0) {
      throw new Error(`logical cleanup incomplete: ${eligibleAfter} eligible api_request rows remain`);
    }

    log(
      `[reclaim-api-request] VERIFIED deleted=${deleted} non_api_request_preserved=${after.nonApiRequest}`,
    );
    emitReport({
      dryRun: false,
      mode: "logical-cleanup",
      before: { ...before, eligibleApiRequest: eligibleBefore, relationBytes: sizeBefore },
      after: { ...after, eligibleApiRequest: eligibleAfter, relationBytes: sizeAfter },
      deleted,
      vacuumFull: false,
      retentionDays,
      batchSize,
    });
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
      `[reclaim-api-request] fatal: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exitCode = 1;
  });
