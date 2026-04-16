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
  "users",
  "password_reset_tokens",
  "security_logs",
  "security_events",
  "security_alerts",
  "user_notification_preferences",
  "user_push_subscriptions",
  "tasks",
  "task_collaborators",
  "wallets",
  "coin_transactions",
  "user_badges",
  "rewards_catalog",
  "user_rewards",
  "offline_generators",
  "offline_skill_nodes",
  "user_offline_skills",
  "usage_snapshots",
  "storage_policies",
  "attachment_assets",
  "task_import_fingerprints",
  "invoices",
  "invoice_events",
  "mfa_challenges",
  "billing_payment_methods",
  "idempotency_keys",
  "premium_subscriptions",
  "premium_saved_views",
  "premium_review_workflows",
  "premium_insights",
  "premium_events",
  "task_patterns",
  "classification_contributions",
  "classification_confirmations",
];

const OPTIONAL_TABLES = ["session"];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url || !String(url).startsWith("postgres")) {
    console.error("migration:verify-schema: set DATABASE_URL to a PostgreSQL connection string.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
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
      process.exit(1);
    }

    console.log("migration:verify-schema: OK — all", REQUIRED_TABLES.length, "required tables present.");
    if (optionalMissing.length > 0) {
      console.warn("migration:verify-schema: optional missing (sessions may not persist across deploys):", optionalMissing.join(", "));
    }
    process.exit(0);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error("migration:verify-schema:", e.message || e);
  process.exit(1);
});
