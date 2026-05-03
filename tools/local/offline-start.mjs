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
const migrationsDirPath = path.join(projectRoot, "migrations");
const applyMigrationsScriptPath = path.join(projectRoot, "scripts", "apply-migrations.mjs");

function runStep(stepLabel, command, args) {
  console.log(`\n[offline:start] ${stepLabel}`);
  // Quote the command on Windows so paths with spaces (e.g. C:\Program Files\…) survive shell splitting.
  const safeCmd = isWin && command.includes(" ") ? `"${command}"` : command;
  const result = spawnSync(safeCmd, args, {
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

function buildMigrationsDirFingerprint() {
  if (!fs.existsSync(migrationsDirPath)) return "";
  const files = fs
    .readdirSync(migrationsDirPath)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const h = createHash("sha256");
  for (const f of files) {
    h.update(f);
    h.update(":");
    h.update(fileHashIfExists(path.join(migrationsDirPath, f)));
    h.update("|");
  }
  return h.digest("hex");
}

function buildSchemaFingerprint() {
  const schemaHash = fileHashIfExists(schemaPath);
  const drizzleHash = fileHashIfExists(drizzleConfigPath);
  const migrationsFp = buildMigrationsDirFingerprint();
  return createHash("sha256")
    .update(`${schemaHash}:${drizzleHash}:${migrationsFp}`)
    .digest("hex");
}

/** Same ordering as Docker / compose migrate service: versioned SQL first. */
function ensureSqlMigrationsApplied() {
  const code = runStep(
    "Applying SQL migrations (migrations/*.sql via scripts/apply-migrations.mjs)",
    process.execPath,
    [applyMigrationsScriptPath],
  );
  if (code !== 0) {
    console.error(
      "[offline:start] SQL migrations failed. Fix migrations/*.sql or DATABASE_URL, then retry.",
    );
    process.exit(code);
  }
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
    console.warn(
      "[offline:start] DATABASE_URL is missing in .env — running in UI-only mode (no database).",
    );
  }

  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.includes("replace-with")) {
    console.warn(
      "[offline:start] SESSION_SECRET still uses placeholder text. Update it before sharing builds.",
    );
  }
}

function hasDatabaseUrl() {
  return !!(process.env.DATABASE_URL && process.env.DATABASE_URL.trim());
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
  // Spawn tsx directly so we do not chain through `npm run dev` (plain dev skips db:push).
  const child = spawn("npx", ["tsx", "server/index.ts"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, NODE_ENV: "development" },
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

console.log("[offline:start] Bootstrapping local offline workflow");
const bootstrap = spawnSync(`"${process.execPath}"`, [path.join(__dirname, "repo-bootstrap.mjs")], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: isWin,
});
if ((bootstrap.status ?? 1) !== 0) process.exit(bootstrap.status ?? 1);

const previousState = readState();
ensureLocalEnvInit();
ensureNodeModules();
validateLocalEnv();
let dependencyFingerprint;
let schemaFingerprint;
if (hasDatabaseUrl()) {
  ensureSqlMigrationsApplied();
  dependencyFingerprint = ensureDependenciesSynced(previousState);
  schemaFingerprint = ensureSchemaApplied(previousState);
} else {
  console.log("[offline:start] Skipping DB migrations & schema push (no DATABASE_URL).");
  dependencyFingerprint = ensureDependenciesSynced(previousState);
  schemaFingerprint = previousState.schemaFingerprint || "";
}

writeState({
  dependencyFingerprint,
  schemaFingerprint,
  updatedAt: new Date().toISOString(),
});

startDevServer();
