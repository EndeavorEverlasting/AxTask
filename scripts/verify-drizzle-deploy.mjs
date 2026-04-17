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

function run(label, command, args) {
  console.log(`[verify-drizzle-deploy] ${label}…`);
  const r = spawnSync(command, args, { stdio: "inherit", shell: false });
  if (r.status !== 0 && r.status !== null) process.exit(r.status);
  if (r.error) throw r.error;
}

run("apply SQL migrations", "node", ["scripts/apply-migrations.mjs"]);
run("drizzle-kit push (1)", "npx", ["drizzle-kit", "push", "--force"]);
run("drizzle-kit push (2)", "npx", ["drizzle-kit", "push", "--force"]);
console.log("[verify-drizzle-deploy] ok");
