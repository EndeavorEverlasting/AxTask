#!/usr/bin/env node
/**
 * Disposable-database proof that the AxTask migration coordinator fails fast
 * under contention and succeeds immediately after the competing runner exits.
 *
 * This verifier refuses non-loopback targets. It deliberately uses the
 * migration runner's --skip-airlock flag only because the target is disposable.
 */
import pgModule from "pg";
const pg = pgModule.default || pgModule;
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { MIGRATION_ADVISORY_LOCK_KEYS } from "./migration-safety.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const parsed = new URL(url);
const loopbackHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (!loopbackHosts.has(parsed.hostname)) {
  throw new Error(`refusing migration contention proof against non-loopback database host: ${parsed.hostname}`);
}

const pool = new pg.Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 5_000 });
const locker = await pool.connect();
let lockHeld = false;

function runMigration(extraEnv) {
  return spawnSync(process.execPath, [path.join(repoRoot, "scripts", "apply-migrations.mjs"), "--skip-airlock"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: url, ...extraEnv },
    encoding: "utf8",
    timeout: 10_000,
  });
}

try {
  const { rows } = await locker.query(
    "SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired",
    MIGRATION_ADVISORY_LOCK_KEYS,
  );
  if (rows[0]?.acquired !== true) throw new Error("could not acquire verifier advisory lock");
  lockHeld = true;

  const blockedStartedAt = Date.now();
  const blocked = runMigration({
    MIGRATION_COORDINATION_TIMEOUT_MS: "750",
    MIGRATION_COORDINATION_RETRY_MS: "50",
  });
  const blockedElapsedMs = Date.now() - blockedStartedAt;
  const blockedOutput = `${blocked.stdout ?? ""}\n${blocked.stderr ?? ""}`;

  if (blocked.error) throw blocked.error;
  if (blocked.status === 0) {
    throw new Error("contended migration unexpectedly succeeded while coordinator lock was held");
  }
  if (!blockedOutput.includes("timed out after 750ms waiting for the AxTask migration coordinator lock")) {
    throw new Error(`contended migration did not fail for the expected bounded coordinator timeout:\n${blockedOutput}`);
  }
  if (blockedElapsedMs > 5_000) {
    throw new Error(`contended migration exceeded fail-fast budget: ${blockedElapsedMs}ms`);
  }

  const { rows: unlockRows } = await locker.query(
    "SELECT pg_advisory_unlock($1::integer, $2::integer) AS released",
    MIGRATION_ADVISORY_LOCK_KEYS,
  );
  if (unlockRows[0]?.released !== true) throw new Error("verifier advisory lock did not release");
  lockHeld = false;

  const unblocked = runMigration({
    MIGRATION_COORDINATION_TIMEOUT_MS: "3000",
    MIGRATION_COORDINATION_RETRY_MS: "50",
  });
  if (unblocked.error) throw unblocked.error;
  if (unblocked.status !== 0) {
    throw new Error(`migration did not recover after contention cleared:\n${unblocked.stdout ?? ""}\n${unblocked.stderr ?? ""}`);
  }

  console.log(
    `[migration-contention] PASS blocked-exit=${blocked.status} blocked-elapsed=${blockedElapsedMs}ms recovery-exit=${unblocked.status}`,
  );
} finally {
  if (lockHeld) {
    try {
      await locker.query(
        "SELECT pg_advisory_unlock($1::integer, $2::integer)",
        MIGRATION_ADVISORY_LOCK_KEYS,
      );
    } catch {
      // Closing the session below also releases the advisory lock.
    }
  }
  locker.release();
  await pool.end();
}
