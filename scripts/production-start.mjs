#!/usr/bin/env node
/**
 * Production entry for native Node hosts (e.g. Render `npm run start`): ordered schema sync then server.
 * Mirrors [`Dockerfile`](../Dockerfile) CMD: SQL migrations → drizzle-kit push --force → node dist/index.js.
 *
 * Emergency bypass Drizzle only (SQL migrations still run): `SKIP_DB_PUSH_ON_START=true`
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distIndex = join(root, "dist/index.js");

if (!existsSync(distIndex)) {
  console.error("[production-start] dist/index.js not found. Run npm run build first.");
  process.exit(1);
}

console.log("[production-start] SQL migrations (apply-migrations.mjs)…");
const m = spawnSync(process.execPath, [join(root, "scripts/apply-migrations.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (m.status !== 0) process.exit(m.status ?? 1);

if (process.env.SKIP_DB_PUSH_ON_START === "true") {
  console.warn("[production-start] SKIP_DB_PUSH_ON_START=true — skipping drizzle-kit push.");
} else {
  const drizzleBin = join(root, "node_modules", "drizzle-kit", "bin.cjs");
  if (!existsSync(drizzleBin)) {
    console.error(
      "[production-start] drizzle-kit not found. Ensure drizzle-kit is installed (production dependency).",
    );
    process.exit(1);
  }
  console.log("[production-start] Drizzle schema sync (drizzle-kit push --force)…");
  const p = spawnSync(process.execPath, [drizzleBin, "push", "--force"], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  if (p.status !== 0) process.exit(p.status ?? 1);
}

console.log("[production-start] Starting server…");
const child = spawn(process.execPath, [distIndex], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, NODE_ENV: process.env.NODE_ENV || "production" },
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
