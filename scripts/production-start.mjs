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
 * Database recovery is intentionally NOT a startup mode. A failed capacity gate
 * leaves normal startup fail-closed. Read-only forensics, one-off containment,
 * targeted logical cleanup, and physical reclaim are separate operator commands
 * documented in docs/DB_RECOVERY_RUNBOOK.md. This prevents a Render restart from
 * silently bypassing the migration airlock or performing destructive recovery.
 *
 * Default production posture:
 *   SKIP_DB_PUSH_ON_START=true, Render detection, or non-interactive terminal → skip drizzle-kit push.
 *
 * Operator override only:
 *   AXTASK_ALLOW_DB_PUSH_ON_START=true
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

// Capacity is evaluated only against an explicit operator budget. Provider hints
// are reported separately and never become an invented billing/physical limit.
// The gate runs before migrations so a deliberate operator limit fails cleanly
// before schema mutation. Recovery from a capacity incident is a separate,
// operator-invoked workflow and is never performed by normal startup.
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
    console.error(
      "[production-start] Keep production suspended. Run: node scripts/db-size-audit.mjs --forensics",
    );
    console.error(
      "[production-start] If api_request containment is missing, use the one-off db-contain-api-request.mjs workflow only after operator authorization.",
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
  const drizzlePushScript = join(root, "scripts/drizzle-push.mjs");
  if (!existsSync(drizzlePushScript)) {
    console.error("[production-start] scripts/drizzle-push.mjs not found.");
    process.exit(1);
  }
  console.log("[production-start] Coordinated Drizzle schema sync (drizzle-push.mjs --force)…");
  const p = spawnSync(process.execPath, [drizzlePushScript, "--force"], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
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
