#!/usr/bin/env node
/**
 * Runs `drizzle-kit push` with logging that survives Windows consoles (no silent failures).
 * Loads .env like drizzle.config.ts (DATABASE_URL).
 *
 * Schema push shares the AxTask migration advisory coordinator with numbered SQL
 * migrations and native graph DDL. The child database sessions also inherit the
 * configured lock/statement/idle-transaction timeouts through PGOPTIONS.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  acquireMigrationCoordinator,
  configureMigrationSession,
  migrationPgOptions,
  migrationSafetyConfig,
  releaseMigrationCoordinator,
} from "./migration-safety.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");
/** Resolve `pg` from project root (hoisted or nested under drizzle-kit). */
const requireFromRoot = createRequire(join(projectRoot, "package.json"));

function describeDatabaseUrl(urlString) {
  if (!urlString || typeof urlString !== "string") {
    return { label: "(missing)", safe: false };
  }
  try {
    const u = new URL(urlString);
    const user = decodeURIComponent(u.username || "") || "(no user)";
    const host = u.host || "(no host)";
    const db = (u.pathname || "").replace(/^\//, "") || "(default db)";
    return {
      label: `${user} @ ${host} / ${db}`,
      safe: true,
    };
  } catch {
    return { label: "(invalid URL — check DATABASE_URL)", safe: false };
  }
}

async function probePostgres(urlString) {
  let pg;
  try {
    pg = requireFromRoot("pg");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, skipped: true, message: `could not load pg: ${msg}` };
  }
  const client = new pg.Client({
    connectionString: urlString,
    connectionTimeoutMillis: 12_000,
  });
  try {
    await client.connect();
    await client.query("select 1 as ok");
    await client.end();
    return { ok: true, message: "select 1 succeeded" };
  } catch (e) {
    try {
      await client.end();
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, skipped: false, message: msg };
  }
}

function runDrizzlePush(safety, extraArgs = []) {
  const env = {
    ...process.env,
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    TERM: "dumb",
    PGOPTIONS: migrationPgOptions(safety, process.env.PGOPTIONS),
    PGCONNECT_TIMEOUT: String(Math.max(1, Math.ceil(safety.connectionTimeoutMs / 1000))),
  };

  const drizzleBin = join(projectRoot, "node_modules", "drizzle-kit", "bin.cjs");
  const args = ["push", "--verbose", ...extraArgs];
  console.log(`[db:push] running: node "${drizzleBin}" ${args.join(" ")}`);

  const result = spawnSync(process.execPath, [drizzleBin, ...args], {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
  });

  if (result.error) throw result.error;
  if (result.signal) throw new Error(`drizzle-kit terminated by signal: ${result.signal}`);
  return result.status ?? 1;
}

console.log("[db:push] AxTask — drizzle schema sync");
if (!process.env.DATABASE_URL) {
  console.error("[db:push] DATABASE_URL is not set.");
  console.error("[db:push] Add it to .env (see docs) or export it in your shell, then retry.");
  process.exit(1);
}

// Migration airlock: refuse to push schema without a recent verified backup
const skipAirlock = process.argv.includes("--skip-airlock") || process.env.MIGRATION_SKIP_AIRLOCK === "true";
if (!skipAirlock) {
  const airlockPath = join(__dirname, "migration-airlock.mjs");
  console.log("[db:push] running migration airlock…");
  const airlockResult = spawnSync(process.execPath, [airlockPath], {
    stdio: ["ignore", "inherit", "inherit"],
    env: process.env,
    cwd: projectRoot,
  });
  if (airlockResult.status !== 0) {
    console.error("[db:push] Migration airlock failed. Refusing to push schema.");
    console.error("[db:push] Pass --skip-airlock to bypass (emergency use only).");
    process.exit(1);
  }
} else {
  console.warn("[db:push] WARNING: migration airlock bypassed via --skip-airlock.");
}

const desc = describeDatabaseUrl(process.env.DATABASE_URL);
console.log(`[db:push] target (password hidden): ${desc.label}`);

const safety = migrationSafetyConfig();
const pg = requireFromRoot("pg");
const coordinatorClient = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: safety.connectionTimeoutMs,
});
let coordinatorConnected = false;
let coordinatorAcquired = false;
let code = 1;

try {
  await coordinatorClient.connect();
  coordinatorConnected = true;
  await configureMigrationSession(coordinatorClient, safety);
  const coordination = await acquireMigrationCoordinator(coordinatorClient, safety);
  coordinatorAcquired = true;
  console.log(
    `[db:push] coordinator acquired attempts=${coordination.attempts} waited=${coordination.waitedMs}ms`,
  );
  code = runDrizzlePush(safety, process.argv.includes("--force") ? ["--force"] : []);
} catch (error) {
  console.error(`[db:push] schema coordination failed: ${error instanceof Error ? error.message : String(error)}`);
  code = 1;
} finally {
  if (coordinatorAcquired) {
    try {
      await releaseMigrationCoordinator(coordinatorClient);
      console.log("[db:push] coordinator released");
    } catch (error) {
      console.error(`[db:push] coordinator release warning: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (coordinatorConnected) {
    try {
      await coordinatorClient.end();
    } catch {
      /* process exit below closes any remaining socket */
    }
  }
}

if (code === 0) {
  console.log("[db:push] done (exit 0).");
  process.exit(0);
}

console.error(`[db:push] drizzle-kit/schema coordination exited with code ${code}.`);
console.error("[db:push] running a direct Postgres probe to surface the driver error (if any)…");

probePostgres(process.env.DATABASE_URL)
  .then((probe) => {
    if (probe.skipped) {
      console.error("[db:push] probe:", probe.message);
      return;
    }
    if (probe.ok) {
      console.error("[db:push] probe: connection OK — failure may be schema drift, permissions, coordinator contention, or drizzle-kit itself.");
      console.error("[db:push] try: npm run db:push:ci");
    } else {
      console.error("[db:push] probe failed:", probe.message);
      console.error(
        "[db:push] fix: verify user/password, host reachability, SSL (?sslmode=require for Neon), and that Postgres is running.",
      );
    }
  })
  .catch((e) => {
    console.error("[db:push] probe error:", e instanceof Error ? e.message : e);
  })
  .finally(() => {
    process.exit(code);
  });
