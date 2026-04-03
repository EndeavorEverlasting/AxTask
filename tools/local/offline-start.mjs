#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync } from "child_process";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const isWin = process.platform === "win32";

const envExamplePath = path.join(projectRoot, ".env.example");
const envPath = path.join(projectRoot, ".env");

function runStep(stepLabel, command, args) {
  console.log(`\n[offline:start] ${stepLabel}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: isWin,
  });
  return result.status ?? 1;
}

function ensureEnvFile() {
  if (fs.existsSync(envPath)) {
    console.log("[offline:start] Found .env");
    return;
  }

  if (!fs.existsSync(envExamplePath)) {
    console.error(
      "[offline:start] Missing .env.example. Cannot auto-bootstrap local config.",
    );
    process.exit(1);
  }

  fs.copyFileSync(envExamplePath, envPath);
  console.log("[offline:start] Created .env from .env.example");
}

function ensureNodeModules() {
  const nodeModulesPath = path.join(projectRoot, "node_modules");
  if (fs.existsSync(nodeModulesPath)) {
    console.log("[offline:start] Dependencies already installed");
    return;
  }

  const installCode = runStep("Installing dependencies (first run)", "npm", [
    "install",
  ]);
  if (installCode !== 0) {
    process.exit(installCode);
  }
}

function validateLocalEnv() {
  dotenv.config({ path: envPath, override: false });

  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
    console.error(
      "[offline:start] DATABASE_URL is missing in .env. Set it to a local PostgreSQL URL.",
    );
    process.exit(1);
  }

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes("replace-with")) {
    console.warn(
      "[offline:start] SESSION_SECRET still uses placeholder text. Update it before sharing builds.",
    );
  }
}

function startDevServer() {
  console.log("\n[offline:start] Starting dev server on http://localhost:5000");
  const child = spawn("npm", ["run", "dev"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: isWin,
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

console.log("[offline:start] Bootstrapping local offline workflow");
ensureNodeModules();
ensureEnvFile();
validateLocalEnv();

const dbPushCode = runStep("Applying database schema (db:push)", "npm", [
  "run",
  "db:push",
]);
if (dbPushCode !== 0) {
  console.error(
    "[offline:start] db:push failed. Ensure PostgreSQL is running and DATABASE_URL points to it.",
  );
  process.exit(dbPushCode);
}

startDevServer();
