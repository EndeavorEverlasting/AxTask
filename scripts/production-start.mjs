#!/usr/bin/env node
/**
 * Production entry for native Node hosts and Docker runtime.
 *
 * Startup policy:
 *   environment gate → DB capacity gate → deterministic SQL migrations → guarded Drizzle policy → server.
 *
 * Production startup must not run live Drizzle schema push by default because
 * drizzle-kit may require interactive operator input when schema drift/conflicts
 * are detected. Render/Docker startup is non-interactive, so that class of
 * prompt can crash deploys before the app binds.
 *
 * Default production posture:
 *   SKIP_DB_PUSH_ON_START=true, Render detection, or non-interactive terminal → skip drizzle-kit push.
 *
 * Operator override only:
 *   AXTASK_ALLOW_DB_PUSH_ON_START=true
 *
 * See docs/SCHEMA_EVOLUTION_PIPELINE.md for the schema evolution model.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distIndex = join(root, "dist/index.js");

const explicitSkipDbPush = process.env.SKIP_DB_PUSH_ON_START === "true";
const explicitAllowDbPush = process.env.AXTASK_ALLOW_DB_PUSH_ON_START === "true";

const runningOnRender =
  process.env.RENDER === "true" ||
  Boolean(process.env.RENDER_SERVICE_ID) ||
  Boolean(process.env.RENDER_EXTERNAL_HOSTNAME);

const nonInteractive = process.stdin.isTTY !== true || process.stdout.isTTY !== true;

const shouldSkipDbPush =
  explicitSkipDbPush || (!explicitAllowDbPush && (runningOnRender || nonInteractive));

if (!existsSync(distIndex)) {
  console.error("[production-start] dist/index.js not found. Run npm run build first.");
  process.exit(1);
}

console.log("[production-start] Environment gate (check-env.mjs --prod)…");
const envGate = spawnSync(
  process.execPath,
  [join(root, "scripts/deploy/check-env.mjs"), "--prod"],
  { cwd: root, stdio: "inherit", env: process.env },
);
if (envGate.status !== 0) {
  console.error("[production-start] check-env failed — fix environment variables before start.");
  process.exit(envGate.status ?? 1);
}

// DB capacity gate (Phase J): runs BEFORE migrations. This catches the
// Neon 512 MB failure class that killed a prior manual deploy *before* we
// start modifying the schema, so a capacity miss is a clean abort rather
// than a half-migrated database. Exit codes: 0 ok, 1 soft fail
// (ACK-able via AXTASK_DB_CAPACITY_ACK=1), 2 hard fail (never proceeds).
// Skippable with AXTASK_SKIP_DB_CAPACITY_CHECK=true — use only when you
// have already verified capacity out-of-band.
if (process.env.AXTASK_SKIP_DB_CAPACITY_CHECK === "true") {
  console.warn("[production-start] AXTASK_SKIP_DB_CAPACITY_CHECK=true — skipping DB capacity gate.");
} else {
  console.log("[production-start] DB capacity gate (check-db-capacity.mjs)…");
  const cap = spawnSync(
    process.execPath,
    [join(root, "scripts/deploy/check-db-capacity.mjs")],
    { cwd: root, stdio: "inherit", env: process.env },
  );
  if (cap.status !== 0) {
    console.error(
      `[production-start] DB capacity gate exited with status ${cap.status} — aborting before migrations.`,
    );
    process.exit(cap.status ?? 1);
  }
}

console.log("[production-start] SQL migrations (apply-migrations.mjs)…");
const m = spawnSync(process.execPath, [join(root, "scripts/apply-migrations.mjs")], {
  cwd: root,
  stdio: "inherit",
  env: process.env,
});
if (m.status !== 0) process.exit(m.status ?? 1);

if (shouldSkipDbPush) {
  const reason = explicitSkipDbPush
    ? "SKIP_DB_PUSH_ON_START=true"
    : runningOnRender
      ? "Render host detected"
      : "non-interactive terminal detected";

  console.warn(`[production-start] ${reason} — skipping drizzle-kit push.`);
  console.warn("[production-start] Set AXTASK_ALLOW_DB_PUSH_ON_START=true to force startup schema push.");
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
    stdio: ["ignore", "inherit", "pipe"],
    env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
  });
  // Suppress harmless TTY warning from drizzle-kit spinners/prompts in non-interactive CI.
  // Fatal prompt failures still return non-zero and stop startup unless explicitly skipped.
  if (p.stderr) {
    const stderrStr = p.stderr.toString("utf8");
    const filtered = stderrStr
      .split("\n")
      .filter((line) => !line.includes("Interactive prompts require a TTY terminal"))
      .join("\n");
    if (filtered) process.stderr.write(filtered);
  }
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