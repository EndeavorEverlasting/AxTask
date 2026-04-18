#!/usr/bin/env node
/**
 * Runs `drizzle-kit push` with logging that survives Windows consoles (no silent failures).
 * Loads .env like drizzle.config.ts (DATABASE_URL).
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

function runDrizzlePush(extraArgs = []) {
  const env = {
    ...process.env,
    CI: "1",
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    TERM: "dumb",
  };

  const drizzleBin = join(projectRoot, "node_modules", "drizzle-kit", "bin.cjs");
  const args = ["push", "--verbose", ...extraArgs];
  console.log(`[db:push] running: node "${drizzleBin}" ${args.join(" ")}`);

  const r = spawnSync(process.execPath, [drizzleBin, ...args], {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
  });

  if (r.error) {
    console.error("[db:push] failed to spawn:", r.error.message);
    process.exit(1);
  }
  if (r.signal) {
    console.error(`[db:push] drizzle-kit terminated by signal: ${r.signal}`);
    process.exit(1);
  }
  return r.status ?? 1;
}

console.log("[db:push] AxTask — drizzle schema sync");
if (!process.env.DATABASE_URL) {
  console.error("[db:push] DATABASE_URL is not set.");
  console.error("[db:push] Add it to .env (see docs) or export it in your shell, then retry.");
  process.exit(1);
}

const desc = describeDatabaseUrl(process.env.DATABASE_URL);
console.log(`[db:push] target (password hidden): ${desc.label}`);

const code = runDrizzlePush();

if (code === 0) {
  console.log("[db:push] done (exit 0).");
  process.exit(0);
}

console.error(`[db:push] drizzle-kit exited with code ${code}.`);
console.error("[db:push] running a direct Postgres probe to surface the driver error (if any)…");

probePostgres(process.env.DATABASE_URL)
  .then((probe) => {
    if (probe.skipped) {
      console.error("[db:push] probe:", probe.message);
      return;
    }
    if (probe.ok) {
      console.error("[db:push] probe: connection OK — failure may be schema drift, permissions, or drizzle-kit itself.");
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
