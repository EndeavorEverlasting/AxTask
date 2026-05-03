#!/usr/bin/env node
/**
 * Development entry: migrate:sql (migrations/*.sql) then drizzle-kit push, then tsx server (same idea as npm start).
 */
import { spawn, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const isWin = process.platform === "win32";

// `npm run dev` runs `predev` (bootstrap) first; skip duplicate when lifecycle is `dev`.
if (process.env.npm_lifecycle_event !== "dev") {
  const bootstrap = spawnSync(process.execPath, [path.join(__dirname, "repo-bootstrap.mjs")], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: isWin,
  });
  if ((bootstrap.status ?? 1) !== 0) process.exit(bootstrap.status ?? 1);
}

dotenv.config({ path: path.join(projectRoot, ".env") });

const skipNorm = String(process.env.SKIP_DB_PUSH_ON_START ?? "").trim().toLowerCase();
const skip = skipNorm === "true" || skipNorm === "1";

if (skip) {
  console.log("[axtask:dev] SKIP_DB_PUSH_ON_START set — skipping drizzle-kit push.");
} else {
  console.log("[axtask:dev] Applying SQL migrations (scripts/apply-migrations.mjs)…");
  const migrate = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "apply-migrations.mjs")], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if ((migrate.status ?? 1) !== 0) {
    console.error("[axtask:dev] apply-migrations.mjs failed. Fix migrations/*.sql or DATABASE_URL.");
    process.exit(migrate.status ?? 1);
  }
  const pre = spawnSync(process.execPath, ["scripts/pre-db-push-kit-workarounds.mjs"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  if ((pre.status ?? 1) !== 0) {
    console.error("[axtask:dev] pre-db-push-kit-workarounds failed.");
    process.exit(pre.status ?? 1);
  }
  console.log("[axtask:dev] Applying database schema (npm run db:push)…");
  const push = spawnSync("npm", ["run", "db:push"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: isWin,
  });
  if ((push.status ?? 1) !== 0) {
    console.error(
      "[axtask:dev] db:push failed. Ensure PostgreSQL is running and DATABASE_URL in .env is correct. To skip, set SKIP_DB_PUSH_ON_START=true.",
    );
    process.exit(push.status ?? 1);
  }
}

const child = spawn("npx", ["tsx", "server/index.ts"], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: isWin,
  env: { ...process.env, NODE_ENV: "development" },
});

child.on("error", (err) => {
  console.error("[axtask:dev] failed to spawn dev server:", err);
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 0));
