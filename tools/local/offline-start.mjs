#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync } from "child_process";
import { createHash } from "crypto";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const isWin = process.platform === "win32";

const envPath = path.join(projectRoot, ".env");
const localStateDir = path.join(projectRoot, ".local");
const stateFilePath = path.join(localStateDir, "smart-start-state.json");
const packageLockPath = path.join(projectRoot, "package-lock.json");
const packageJsonPath = path.join(projectRoot, "package.json");
const schemaPath = path.join(projectRoot, "shared", "schema.ts");
const drizzleConfigPath = path.join(projectRoot, "drizzle.config.ts");

function runStep(stepLabel, command, args) {
  console.log(`\n[offline:start] ${stepLabel}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: isWin,
  });
  return result.status ?? 1;
}

function ensureLocalEnvInit() {
  const code = runStep("Local environment (.env + SESSION_SECRET)", "npm", [
    "run",
    "local:env-init",
  ]);
  if (code !== 0) {
    process.exit(code);
  }
}

function ensureNodeModules() {
  const nodeModulesPath = path.join(projectRoot, "node_modules");
  if (fs.existsSync(nodeModulesPath)) {
    console.log("[offline:start] Dependencies already installed");
    return;
  }

  const installCode = runStep("Installing dependencies (first run)", "npm", ["run", "deps:sync"]);
  if (installCode !== 0) {
    process.exit(installCode);
  }
}

function fileHashIfExists(filePath) {
  if (!fs.existsSync(filePath)) return "";
  const content = fs.readFileSync(filePath);
  return createHash("sha256").update(content).digest("hex");
}

function readState() {
  if (!fs.existsSync(stateFilePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(stateFilePath, "utf8"));
  } catch {
    return {};
  }
}

function writeState(nextState) {
  fs.mkdirSync(localStateDir, { recursive: true });
  fs.writeFileSync(stateFilePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
}

function buildDependencyFingerprint() {
  // Prefer lockfile; fall back to package.json if lockfile is unavailable.
  return fileHashIfExists(packageLockPath) || fileHashIfExists(packageJsonPath);
}

function buildSchemaFingerprint() {
  const schemaHash = fileHashIfExists(schemaPath);
  const drizzleHash = fileHashIfExists(drizzleConfigPath);
  return createHash("sha256")
    .update(`${schemaHash}:${drizzleHash}`)
    .digest("hex");
}

function ensureDependenciesSynced(state) {
  const dependencyFingerprint = buildDependencyFingerprint();
  if (!dependencyFingerprint) {
    console.warn("[offline:start] Could not determine dependency fingerprint; skipping sync check.");
    return dependencyFingerprint;
  }

  if (state.dependencyFingerprint === dependencyFingerprint) {
    console.log("[offline:start] Dependencies unchanged since last successful run");
    return dependencyFingerprint;
  }

  const syncCode = runStep("Syncing dependencies (changed lock/package files)", "npm", ["run", "deps:sync"]);
  if (syncCode !== 0) process.exit(syncCode);
  return dependencyFingerprint;
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

function ensureSchemaApplied(state) {
  const schemaFingerprint = buildSchemaFingerprint();
  if (!schemaFingerprint) {
    console.warn("[offline:start] Could not determine schema fingerprint; running db:push to be safe.");
    const fallbackCode = runStep("Applying database schema (fallback db:push)", "npm", ["run", "db:push"]);
    if (fallbackCode !== 0) {
      console.error("[offline:start] db:push failed. Ensure PostgreSQL is running and DATABASE_URL points to it.");
      process.exit(fallbackCode);
    }
    return schemaFingerprint;
  }

  if (state.schemaFingerprint === schemaFingerprint) {
    console.log("[offline:start] Schema unchanged since last successful run");
    return schemaFingerprint;
  }

  const dbPushCode = runStep("Applying database schema (changed schema fingerprint)", "npm", ["run", "db:push"]);
  if (dbPushCode !== 0) {
    console.error("[offline:start] db:push failed. Ensure PostgreSQL is running and DATABASE_URL points to it.");
    process.exit(dbPushCode);
  }
  return schemaFingerprint;
}

function startDevServer() {
  console.log("\n[offline:start] Starting dev server on http://localhost:5000");
  // Spawn tsx directly so we do not chain through `npm run dev` (which runs db:push again).
  const child = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: isWin,
    env: { ...process.env, NODE_ENV: "development" },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

console.log("[offline:start] Bootstrapping local offline workflow");
const previousState = readState();
ensureLocalEnvInit();
ensureNodeModules();
validateLocalEnv();
const dependencyFingerprint = ensureDependenciesSynced(previousState);
const schemaFingerprint = ensureSchemaApplied(previousState);

writeState({
  dependencyFingerprint,
  schemaFingerprint,
  updatedAt: new Date().toISOString(),
});

startDevServer();
