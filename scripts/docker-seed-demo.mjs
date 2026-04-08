#!/usr/bin/env node
/**
 * Optional one-shot for the Docker Compose **migrate** service: upsert a fixed local demo user
 * when AXTASK_DOCKER_SEED_DEMO=1. Intended for **local** stacks only; set AXTASK_DOCKER_SEED_DEMO=0
 * (and remove weak passwords) before exposing Compose to the internet.
 */
import bcrypt from "bcrypt";
import pg from "pg";
import { randomUUID } from "crypto";

const enabled =
  process.env.AXTASK_DOCKER_SEED_DEMO === "1" ||
  String(process.env.AXTASK_DOCKER_SEED_DEMO || "").toLowerCase() === "true";

if (!enabled) {
  process.exit(0);
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.warn("[docker-seed-demo] DATABASE_URL missing; skipping demo user.");
  process.exit(0);
}

const email = (process.env.DOCKER_DEMO_USER_EMAIL || "demo@axtask.local").trim().toLowerCase();
const password = process.env.DOCKER_DEMO_PASSWORD?.trim();

if (!password || password.length < 8) {
  console.warn(
    "[docker-seed-demo] DOCKER_DEMO_PASSWORD missing or shorter than 8 characters; skipping demo user.",
  );
  process.exit(0);
}

const displayName = (process.env.DOCKER_DEMO_DISPLAY_NAME || "Docker Demo").trim() || "Docker Demo";
const role = process.env.DOCKER_DEMO_ROLE === "admin" ? "admin" : "user";

let pool;
try {
  pool = new pg.Pool({ connectionString: databaseUrl });
  const hash = await bcrypt.hash(password, 12);
  const id = randomUUID();
  await pool.query(
    `INSERT INTO users (id, email, password_hash, display_name, role, auth_provider, failed_login_attempts, is_banned)
     VALUES ($1, $2, $3, $4, $5, 'local', 0, false)
     ON CONFLICT (email) DO UPDATE SET
       password_hash = EXCLUDED.password_hash,
       display_name = EXCLUDED.display_name,
       role = EXCLUDED.role,
       auth_provider = 'local',
       failed_login_attempts = 0,
       locked_until = NULL,
       is_banned = false`,
    [id, email, hash, displayName, role],
  );
  console.log(
    `[docker-seed-demo] Demo user ready: ${email} (role: ${role}). Open http://localhost:5000 and sign in.`,
  );
} catch (e) {
  console.error("[docker-seed-demo] Failed:", e);
  process.exit(1);
} finally {
  if (pool) await pool.end();
}
