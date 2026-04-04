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
