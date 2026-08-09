#!/usr/bin/env node
/**
 * Targeted api_request telemetry cleanup for security_events.
 *
 * Safely removes ONLY event_type='api_request' rows from security_events,
 * preserving all other security audit events.
 *
 * SAFETY GATES:
 *   - DRY RUN BY DEFAULT (use --execute to mutate)
 *   - Requires explicit --confirm=YES token
 *   - Requires explicit --prod flag (or NODE_ENV=production)
 *   - Refuses to run against non-loopback DATABASE_URL unless --force-production
 *   - Never TRUNCATEs security_events
 *   - Never drops indexes automatically
 *   - Prefers bounded/batched deletion over one enormous transaction
 *   - Emits before/after counts
 *   - Supports logical-only mode (--logical-only)
 *   - Physical reclaim (VACUUM FULL) is a separate explicit step
 *
 * Usage:
 *   node scripts/db-reclaim-api-request.mjs --dry-run
 *   node scripts/db-reclaim-api-request.mjs --execute --confirm=YES --prod
 *   node scripts/db-reclaim-api-request.mjs --execute --confirm=YES --prod --logical-only
 *   node scripts/db-reclaim-api-request.mjs --execute --confirm=YES --prod --retention-days=7
 *   node scripts/db-reclaim-api-request.mjs --execute --confirm=YES --prod --batch-size=5000
 *
 * Env: DATABASE_URL (required)
 */

import pgModule from "pg";
const pg = pgModule.default || pgModule;

const args = parseArgs(process.argv.slice(2));

const dryRun = args.has("dry-run") || !args.has("execute");
const confirm = args.get("confirm");
const isProd = args.has("prod") || process.env.NODE_ENV === "production";
const forceProduction = args.has("force-production");
const logicalOnly = args.has("logical-only");
const retentionDays = Number(args.get("retention-days") ?? 1);
const batchSize = Number(args.get("batch-size") ?? 5000);
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
    get: (k) => map.get(k),
    has: (k) => map.has(k),
  };
}

function log(...args) {
  if (!jsonOutput) console.error(...args);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return String(bytes);
  if (bytes < 1024) return `${bytes} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} kB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function isLocalDatabase(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.startsWith("192.168.") || host.startsWith("10.") || host.endsWith(".local");
  } catch {
    return false;
  }
}

async function getApiRequestCount(client, retentionDays) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::bigint AS cnt FROM security_events WHERE event_type = 'api_request' AND created_at < now() - interval '${retentionDays} day'`
  );
  return Number(rows[0].cnt);
}

async function getTotalSecurityEventsCount(client) {
  const { rows } = await client.query(`SELECT COUNT(*)::bigint AS cnt FROM security_events`);
  return Number(rows[0].cnt);
}

async function getNonApiRequestCount(client) {
  const { rows } = await client.query(`SELECT COUNT(*)::bigint AS cnt FROM security_events WHERE event_type != 'api_request'`);
  return Number(rows[0].cnt);
}

async function runBatchedDelete(client, retentionDays, batchSize) {
  let totalDeleted = 0;
  let batchNum = 0;

  while (true) {
    batchNum++;
    const sql = `
      DELETE FROM security_events
      WHERE ctid IN (
        SELECT ctid
        FROM security_events
        WHERE event_type = 'api_request'
          AND created_at < now() - interval '${retentionDays} day'
        LIMIT ${batchSize}
      )
    `;

    const start = Date.now();
    const res = await client.query(sql);
    const ms = Date.now() - start;
    const deleted = res.rowCount ?? 0;
    totalDeleted += deleted;

    log(`[reclaim-api-request] batch ${batchNum}: deleted ${deleted} rows in ${ms} ms (total: ${totalDeleted})`);

    if (deleted < batchSize) break;
  }

  return totalDeleted;
}

async function runVacuumFull(client) {
  log(`[reclaim-api-request] Running VACUUM FULL on security_events...`);
  const start = Date.now();
  await client.query(`VACUUM FULL security_events`);
  const ms = Date.now() - start;
  log(`[reclaim-api-request] VACUUM FULL completed in ${ms} ms`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[reclaim-api-request] DATABASE_URL is not set.");
    process.exit(1);
  }

  // Safety: refuse mutation without explicit confirmation
  if (!dryRun && confirm !== "YES") {
    console.error("[reclaim-api-request] refusing to run without --confirm=YES");
    process.exit(2);
  }

  // Safety: refuse mutation without production intent
  if (!dryRun && !isProd) {
    console.error("[reclaim-api-request] refusing to run without --prod (or NODE_ENV=production).");
    process.exit(2);
  }

  // Safety: refuse mutation against non-loopback unless explicitly forced
  if (!dryRun && !forceProduction && !isLocalDatabase(url)) {
    console.error("[reclaim-api-request] refusing to mutate non-loopback DATABASE_URL without --force-production.");
    console.error("[reclaim-api-request] This script is for local/disposable databases. Use --force-production ONLY with explicit authorization.");
    process.exit(2);
  }

  // Safety: never log DATABASE_URL
  const maskedUrl = url.replace(/:[^:@]*@/, ":***@");
  log(`[reclaim-api-request] target: ${maskedUrl}  dry_run=${dryRun}  prod=${isProd}  logical_only=${logicalOnly}  retention_days=${retentionDays}  batch_size=${batchSize}`);

  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await pool.connect();

  try {
    // BEFORE counts
    const beforeTotal = await getTotalSecurityEventsCount(client);
    const beforeApiRequest = await getApiRequestCount(client, retentionDays);
    const beforeNonApiRequest = await getNonApiRequestCount(client);

    log(`[reclaim-api-request] BEFORE: total=${beforeTotal.toLocaleString()}  api_request(eligible)=${beforeApiRequest.toLocaleString()}  non_api_request=${beforeNonApiRequest.toLocaleString()}`);

    if (dryRun) {
      log(`[reclaim-api-request] DRY RUN: would delete ${beforeApiRequest.toLocaleString()} api_request rows older than ${retentionDays} day(s)`);
      log(`[reclaim-api-request] DRY RUN: non-api_request rows (${beforeNonApiRequest.toLocaleString()}) would be PRESERVED`);

      if (!logicalOnly) {
        log(`[reclaim-api-request] DRY RUN: would run VACUUM FULL on security_events after deletion`);
      }

      const report = {
        dryRun: true,
        before: { total: beforeTotal, apiRequest: beforeApiRequest, nonApiRequest: beforeNonApiRequest },
        after: { total: beforeTotal - beforeApiRequest, apiRequest: 0, nonApiRequest: beforeNonApiRequest },
        deleted: beforeApiRequest,
        vacuumFull: !logicalOnly,
      };

      if (jsonOutput) console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }

    // Execute deletion in a transaction
    await client.query("BEGIN");
    try {
      const deleted = await runBatchedDelete(client, retentionDays, batchSize);
      await client.query("COMMIT");

      // AFTER counts
      const afterTotal = await getTotalSecurityEventsCount(client);
      const afterApiRequest = await getApiRequestCount(client, retentionDays);
      const afterNonApiRequest = await getNonApiRequestCount(client);

      log(`[reclaim-api-request] AFTER: total=${afterTotal.toLocaleString()}  api_request(eligible)=${afterApiRequest.toLocaleString()}  non_api_request=${afterNonApiRequest.toLocaleString()}`);
      log(`[reclaim-api-request] DELETED: ${deleted.toLocaleString()} api_request rows`);

      // Verify non-api_request rows preserved
      if (afterNonApiRequest !== beforeNonApiRequest) {
        console.error(`[reclaim-api-request] ERROR: non-api_request count changed! before=${beforeNonApiRequest} after=${afterNonApiRequest}`);
        process.exit(3);
      }
      log(`[reclaim-api-request] VERIFIED: non-api_request rows preserved (${afterNonApiRequest.toLocaleString()})`);

      // Physical reclaim if not logical-only
      if (!logicalOnly) {
        // VACUUM FULL cannot run in a transaction
        await runVacuumFull(client);

        const afterVacuumTotal = await getTotalSecurityEventsCount(client);
        const afterVacuumApiRequest = await getApiRequestCount(client, retentionDays);
        log(`[reclaim-api-request] POST-VACUUM: total=${afterVacuumTotal.toLocaleString()}  api_request(eligible)=${afterVacuumApiRequest.toLocaleString()}`);
      }

      const report = {
        dryRun: false,
        before: { total: beforeTotal, apiRequest: beforeApiRequest, nonApiRequest: beforeNonApiRequest },
        after: { total: afterTotal, apiRequest: afterApiRequest, nonApiRequest: afterNonApiRequest },
        deleted: deleted,
        vacuumFull: !logicalOnly,
        retentionDays,
        batchSize,
      };

      if (jsonOutput) console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } catch (err) {
    console.error("[reclaim-api-request] fatal:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[reclaim-api-request] fatal:", err);
  process.exit(1);
});