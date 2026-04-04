#!/usr/bin/env node
/**
 * Create .env from .env.example if missing, then ensure SESSION_SECRET is set locally.
 * Use: npm run local:env-init
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const dest = path.join(projectRoot, ".env");
const src = path.join(projectRoot, ".env.example");
const bootstrapScript = path.join(__dirname, "bootstrap-local-secrets.mjs");

function runBootstrap() {
  const r = spawnSync(process.execPath, [bootstrapScript], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!fs.existsSync(dest)) {
  if (!fs.existsSync(src)) {
    console.error("[local:env-init] Missing .env.example");
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  console.log("[local:env-init] Created .env from .env.example");
} else {
  console.log("[local:env-init] .env already exists; leaving existing keys unchanged (except SESSION_SECRET if needed).");
}

runBootstrap();
console.log(
  "[local:env-init] Set DATABASE_URL if needed, then npm run db:push && npm run dev",
);
