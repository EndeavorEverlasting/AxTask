#!/usr/bin/env node
/**
 * Mirrors production DB startup: SQL migrations then two idempotent drizzle-kit pushes.
 * Requires DATABASE_URL. Use: npm run db:push:verify
 */
import { spawnSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  console.error("[verify-drizzle-deploy] DATABASE_URL is required.");
  process.exit(1);
}

function run(label, command, args, { closeStdin = false } = {}) {
  console.log(`[verify-drizzle-deploy] ${label}…`);
  const stdio = closeStdin
    ? ["ignore", "inherit", "inherit"]
    : "inherit";
  const r = spawnSync(command, args, { stdio, shell: false });
  if (r.error) throw r.error;
  if (r.signal != null) {
    console.error(`[verify-drizzle-deploy] ${label} terminated by signal: ${r.signal}`);
    process.exit(1);
  }
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

run("apply SQL migrations", "node", ["scripts/apply-migrations.mjs"]);
run("drizzle-kit push (1)", "npx", ["drizzle-kit", "push", "--force"], { closeStdin: true });
run("drizzle-kit push (2)", "npx", ["drizzle-kit", "push", "--force"], { closeStdin: true });
console.log("[verify-drizzle-deploy] ok");
