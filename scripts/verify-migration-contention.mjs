#!/usr/bin/env node
/**
 * Disposable-database proof that AxTask schema-changing commands fail fast
 * under coordinator contention and recover after the competing runner exits.
 *
 * This verifier refuses non-loopback targets. It deliberately uses each
 * command's --skip-airlock flag only because the target is disposable.
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

function runScript(relativePath, args, extraEnv) {
  return spawnSync(process.execPath, [path.join(repoRoot, relativePath), ...args], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: url, ...extraEnv },
    encoding: "utf8",
    timeout: 10_000,
  });
}

function assertBlocked(result, label, elapsedMs) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (result.error) throw result.error;
  if (result.status === 0) throw new Error(`${label} unexpectedly succeeded while coordinator lock was held`);
  if (!output.includes("timed out after 750ms waiting for the AxTask migration coordinator lock")) {
    throw new Error(`${label} did not fail for the expected bounded coordinator timeout:\n${output}`);
  }
  if (elapsedMs > 5_000) throw new Error(`${label} exceeded fail-fast budget: ${elapsedMs}ms`);
}

function assertSucceeded(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} did not recover after contention cleared:\n${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  }
}

try {
  const { rows } = await locker.query(
    "SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired",
    MIGRATION_ADVISORY_LOCK_KEYS,
  );
  if (rows[0]?.acquired !== true) throw new Error("could not acquire verifier advisory lock");
  lockHeld = true;

  const contentionEnv = {
    MIGRATION_COORDINATION_TIMEOUT_MS: "750",
    MIGRATION_COORDINATION_RETRY_MS: "50",
  };

  const migrationStartedAt = Date.now();
  const blockedMigration = runScript("scripts/apply-migrations.mjs", ["--skip-airlock"], contentionEnv);
  const migrationElapsedMs = Date.now() - migrationStartedAt;
  assertBlocked(blockedMigration, "numbered migration runner", migrationElapsedMs);

  const pushStartedAt = Date.now();
  const blockedPush = runScript("scripts/drizzle-push.mjs", ["--skip-airlock", "--force"], contentionEnv);
  const pushElapsedMs = Date.now() - pushStartedAt;
  assertBlocked(blockedPush, "Drizzle schema push", pushElapsedMs);

  const { rows: unlockRows } = await locker.query(
    "SELECT pg_advisory_unlock($1::integer, $2::integer) AS released",
    MIGRATION_ADVISORY_LOCK_KEYS,
  );
  if (unlockRows[0]?.released !== true) throw new Error("verifier advisory lock did not release");
  lockHeld = false;

  const recoveryEnv = {
    MIGRATION_COORDINATION_TIMEOUT_MS: "3000",
    MIGRATION_COORDINATION_RETRY_MS: "50",
  };
  const unblockedMigration = runScript("scripts/apply-migrations.mjs", ["--skip-airlock"], recoveryEnv);
  assertSucceeded(unblockedMigration, "numbered migration runner");

  const unblockedPush = runScript("scripts/drizzle-push.mjs", ["--skip-airlock", "--force"], recoveryEnv);
  assertSucceeded(unblockedPush, "Drizzle schema push");

  console.log(
    `[migration-contention] PASS migration-blocked=${migrationElapsedMs}ms push-blocked=${pushElapsedMs}ms recovery=ok`,
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
