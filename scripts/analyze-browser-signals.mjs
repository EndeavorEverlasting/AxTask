#!/usr/bin/env node
/**
 * Read-only analysis of browser-bound signals in security_events.
 *
 * Answers: per-user distinct User-Agent hashes (proxy for distinct browser strings)
 * over 7 and 30 days. Uses api_request rows by default (high volume); prefer
 * login rollup event types when available — see docs/BROWSER_BOUND_SIGNALS.md.
 *
 * Usage:  node scripts/analyze-browser-signals.mjs
 * Env:    DATABASE_URL (required)
 */
import pgModule from "pg";
const pg = pgModule.default || pgModule;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Read-only rollup of browser-bound signals in security_events (requires DATABASE_URL).
Usage: node scripts/analyze-browser-signals.mjs
See docs/BROWSER_BOUND_SIGNALS.md`);
  process.exit(0);
}

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const LOGIN_TYPES = [
  "auth_login_success",
  "auth_totp_login_success",
  "oauth_login_success",
  "client_instance_observed",
];

async function main() {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    console.log("AxTask browser-bound signal analysis (read-only)\n");
    console.log(
      "Caveat: distinct user_agent_hash tracks distinct User-Agent *strings*. " +
        "Browser updates and UA reduction can change the hash without a new browser.\n",
    );

    for (const days of [7, 30]) {
      const interval = `${days} days`;
      const { rows: apiRows } = await client.query(
        `SELECT
           actor_user_id,
           COUNT(DISTINCT user_agent_hash) AS distinct_ua_hashes,
           COUNT(*)::bigint AS row_count
         FROM security_events
         WHERE event_type = 'api_request'
           AND actor_user_id IS NOT NULL
           AND user_agent_hash IS NOT NULL
           AND created_at >= NOW() - $1::interval
         GROUP BY actor_user_id
         ORDER BY distinct_ua_hashes DESC, row_count DESC
         LIMIT 25`,
        [interval],
      );

      console.log(`--- api_request / ${days}d: top 25 users by distinct UA hash ---`);
      if (apiRows.length === 0) {
        console.log("(no rows)\n");
      } else {
        console.table(
          apiRows.map((r) => ({
            userId: r.actor_user_id?.slice(0, 8) + "…",
            distinctUa: Number(r.distinct_ua_hashes),
            events: String(r.row_count),
          })),
        );
      }

      const inList = LOGIN_TYPES.map((_, i) => `$${i + 2}`).join(", ");
      const { rows: rollupRows } = await client.query(
        `SELECT
           actor_user_id,
           COUNT(DISTINCT user_agent_hash) AS distinct_ua_hashes,
           COUNT(*)::bigint AS event_count
         FROM security_events
         WHERE event_type IN (${inList})
           AND actor_user_id IS NOT NULL
           AND user_agent_hash IS NOT NULL
           AND created_at >= NOW() - $1::interval
         GROUP BY actor_user_id
         ORDER BY distinct_ua_hashes DESC, event_count DESC
         LIMIT 25`,
        [interval, ...LOGIN_TYPES],
      );

      console.log(`--- login rollup event types / ${days}d: top 25 by distinct UA hash ---`);
      console.log(`    types: ${LOGIN_TYPES.join(", ")}\n`);
      if (rollupRows.length === 0) {
        console.log("(no rows)\n");
      } else {
        console.table(
          rollupRows.map((r) => ({
            userId: r.actor_user_id?.slice(0, 8) + "…",
            distinctUa: Number(r.distinct_ua_hashes),
            events: String(r.event_count),
          })),
        );
      }
    }

    const { rows: totals } = await client.query(
      `SELECT
         event_type,
         COUNT(*)::bigint AS n
       FROM security_events
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY event_type
       ORDER BY n DESC
       LIMIT 15`,
    );
    console.log("--- 30d: top event_type counts (context for volume) ---\n");
    console.table(totals.map((r) => ({ eventType: r.event_type, count: String(r.n) })));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
