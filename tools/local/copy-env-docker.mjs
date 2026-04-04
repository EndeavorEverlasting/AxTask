#!/usr/bin/env node
/**
 * Create .env.docker from .env.docker.example if missing (cross-platform).
 * Use: npm run docker:env-init
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const dest = path.join(projectRoot, ".env.docker");
const src = path.join(projectRoot, ".env.docker.example");

if (fs.existsSync(dest)) {
  console.log("[docker:env-init] .env.docker already exists; leaving it unchanged.");
  process.exit(0);
}
if (!fs.existsSync(src)) {
  console.error("[docker:env-init] Missing .env.docker.example");
  process.exit(1);
}
fs.copyFileSync(src, dest);
console.log(
  "[docker:env-init] Created .env.docker from .env.docker.example — replace placeholders, then run npm run docker:up",
);
