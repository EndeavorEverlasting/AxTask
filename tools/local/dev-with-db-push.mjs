#!/usr/bin/env node
/**
 * Development entry: drizzle-kit push then tsx server (same idea as npm start, for local dev).
 */
import { spawn, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const isWin = process.platform === "win32";

dotenv.config({ path: path.join(projectRoot, ".env") });

const skip =
  String(process.env.SKIP_DB_PUSH_ON_START || "").trim().toLowerCase() === "true" ||
  process.env.SKIP_DB_PUSH_ON_START === "1";

if (skip) {
  console.log("[axtask:dev] SKIP_DB_PUSH_ON_START set — skipping drizzle-kit push.");
} else {
  console.log("[axtask:dev] Applying database schema (drizzle-kit push)…");
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

child.on("exit", (code) => process.exit(code ?? 0));
