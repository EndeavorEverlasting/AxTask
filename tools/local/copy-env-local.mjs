#!/usr/bin/env node
/**
 * Create .env from .env.example if missing (cross-platform).
 * Use: npm run local:env-init
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const dest = path.join(projectRoot, ".env");
const src = path.join(projectRoot, ".env.example");

if (fs.existsSync(dest)) {
  console.log("[local:env-init] .env already exists; leaving it unchanged.");
  process.exit(0);
}
if (!fs.existsSync(src)) {
  console.error("[local:env-init] Missing .env.example");
  process.exit(1);
}
fs.copyFileSync(src, dest);
console.log(
  "[local:env-init] Created .env from .env.example — set DATABASE_URL, then npm run db:push && npm run dev",
);
