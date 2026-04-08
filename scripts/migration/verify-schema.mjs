/**
 * Verify expected AxTask tables exist in PostgreSQL (post-restore + db:push).
 * Usage: DATABASE_URL=... node scripts/migration/verify-schema.mjs
 * Or: npm run migration:verify-schema (loads .env via dotenv)
 */
import "dotenv/config";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { Pool } = require("pg");

/** Drizzle app tables (public schema). Session table is optional (connect-pg-simple). */
const REQUIRED_TABLES = [
  "applied_sql_migrations",
  "appeal_votes",
  "appeals",
  "app_runtime_secrets",
  "attachment_assets",
  "avatar_profiles",
  "avatar_xp_events",
  "billing_payment_methods",
  "classification_confirmations",
  "classification_contributions",
  "coin_transactions",
  "device_refresh_tokens",
  "idempotency_keys",
  "invoice_events",
  "invoices",
  "mfa_challenges",
  "offline_generators",
  "offline_skill_nodes",
  "password_reset_tokens",
  "premium_events",
  "premium_insights",
  "premium_review_workflows",
  "premium_saved_views",
  "premium_subscriptions",
  "product_funnel_events",
  "rewards_catalog",
  "security_alerts",
  "security_events",
  "security_logs",
  "storage_policies",
  "task_collaborators",
  "task_import_fingerprints",
  "task_patterns",
  "tasks",
  "usage_snapshots",
  "user_badges",
  "user_billing_profiles",
  "user_classification_categories",
  "user_entourage",
  "user_youtube_probe_state",
  "youtube_probe_feedback",
  "user_milestone_grants",
  "user_notification_preferences",
  "user_offline_skills",
  "user_push_subscriptions",
  "user_rewards",
  "users",
  "wallets",
];

const OPTIONAL_TABLES = ["session"];

/** Unique indexes that must exist after `npm run db:push` (Drizzle names). */
const REQUIRED_UNIQUE_INDEXES = [{ table: "user_rewards", indexname: "ux_user_rewards_user_reward" }];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !String(url).startsWith("postgres")) {
    console.error("migration:verify-schema: set DATABASE_URL to a PostgreSQL connection string.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  let exitCode = 0;
  try {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    const have = new Set(rows.map((r) => r.table_name));
    const missing = REQUIRED_TABLES.filter((t) => !have.has(t));
    const optionalMissing = OPTIONAL_TABLES.filter((t) => !have.has(t));

    if (missing.length > 0) {
      console.error("migration:verify-schema: missing tables:", missing.join(", "));
      console.error("Run npm run db:push against this database from integration/migration-unified.");
      exitCode = 1;
    } else {
      console.log("migration:verify-schema: OK — all", REQUIRED_TABLES.length, "required tables present.");
      if (optionalMissing.length > 0) {
        console.warn("migration:verify-schema: optional missing (sessions may not persist across deploys):", optionalMissing.join(", "));
      }
    }

    if (exitCode === 0) {
      const { rows: idxRows } = await pool.query(
        `SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public'`,
      );
      const indexKey = (t, i) => `${t}\0${i}`;
      const haveIdx = new Set(idxRows.map((r) => indexKey(r.tablename, r.indexname)));
      const missingIdx = REQUIRED_UNIQUE_INDEXES.filter(
        ({ table, indexname }) => !haveIdx.has(indexKey(table, indexname)),
      );
      if (missingIdx.length > 0) {
        console.error(
          "migration:verify-schema: missing unique index(es):",
          missingIdx.map((x) => `${x.table}.${x.indexname}`).join(", "),
        );
        console.error("Run npm run db:push so (user_id, reward_id) uniqueness is enforced on user_rewards.");
        exitCode = 1;
      } else {
        console.log("migration:verify-schema: OK — required unique indexes present.");
      }
    }
  } finally {
    await pool.end();
  }
  process.exit(exitCode);
}

main().catch((e) => {
  console.error("migration:verify-schema:", e.message || e);
  process.exit(1);
});
