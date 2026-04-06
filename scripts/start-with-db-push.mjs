#!/usr/bin/env node
/**
 * Production entry: apply Drizzle schema to DATABASE_URL, then start the bundled server.
 * Docker Compose: set SKIP_DB_PUSH_ON_START=true on the app container when a migrate job already ran.
 */
import { spawn, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const isWin = process.platform === "win32";

dotenv.config({ path: path.join(projectRoot, ".env") });

const rawSkip = String(process.env.SKIP_DB_PUSH_ON_START || "").trim().toLowerCase();
const skip = rawSkip === "true" || rawSkip === "1";

if (skip) {
  console.log("[axtask:start] SKIP_DB_PUSH_ON_START set — skipping drizzle-kit push.");
} else {
  console.log("[axtask:start] Applying database schema (drizzle-kit push)…");
  const push = spawnSync("npm", ["run", "db:push"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: isWin,
  });
  if ((push.status ?? 1) !== 0) {
    console.error(
      "[axtask:start] db:push failed. Check DATABASE_URL and that Postgres is reachable. To start anyway, set SKIP_DB_PUSH_ON_START=true.",
    );
    process.exit(push.status ?? 1);
  }
}

const entry = path.join(projectRoot, "dist", "index.js");
const child = spawn(process.execPath, [entry], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
});

child.on("error", (err) => {
  console.error("[axtask:start] failed to spawn server process:", err);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
