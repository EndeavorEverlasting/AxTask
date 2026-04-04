#!/usr/bin/env node
/**
 * Smart Docker Compose startup: env bootstrap, placeholder checks, optional
 * Docker Desktop launch (Windows/macOS), wait for engine, then up -d [--build].
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync } from "child_process";
import { setTimeout as delay } from "timers/promises";
import {
  dockerDesktopExeCandidates,
  firstExistingPath,
  parseDockerUpArgv,
  validateEnvDockerText,
} from "./docker-start-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..", "..");
const isWin = process.platform === "win32";
const isMac = process.platform === "darwin";

const envDockerPath = path.join(projectRoot, ".env.docker");
const envDockerExamplePath = path.join(projectRoot, ".env.docker.example");

const { noLaunch, noBuild } = parseDockerUpArgv(process.argv.slice(2));

const WAIT_ENGINE_MS = 120_000;
const WAIT_ENGINE_INTERVAL_MS = 3000;

function runSync(label, command, commandArgs, options = {}) {
  console.log(`\n[docker:up] ${label}`);
  const result = spawnSync(command, commandArgs, {
    cwd: projectRoot,
    stdio: "inherit",
    shell: isWin,
    ...options,
  });
  return result.status ?? 1;
}

function dockerCliOk() {
  const r = spawnSync("docker", ["version"], {
    cwd: projectRoot,
    stdio: "pipe",
    shell: isWin,
  });
  return r.status === 0;
}

function dockerEngineOk() {
  const r = spawnSync("docker", ["info"], {
    cwd: projectRoot,
    stdio: "pipe",
    shell: isWin,
  });
  return r.status === 0;
}

function composePluginOk() {
  const r = spawnSync("docker", ["compose", "version"], {
    cwd: projectRoot,
    stdio: "pipe",
    shell: isWin,
  });
  return r.status === 0;
}

function ensureEnvDocker() {
  if (fs.existsSync(envDockerPath)) {
    console.log("[docker:up] Found .env.docker");
    return;
  }
  if (!fs.existsSync(envDockerExamplePath)) {
    console.error(
      "[docker:up] Missing .env.docker.example. Cannot create .env.docker.",
    );
    process.exit(1);
  }
  fs.copyFileSync(envDockerExamplePath, envDockerPath);
  console.log("[docker:up] Created .env.docker from .env.docker.example");
}

function validateEnvDocker() {
  const text = fs.readFileSync(envDockerPath, "utf8");
  const invalid = validateEnvDockerText(text);
  if (invalid === "session_secret") {
    console.error(
      "[docker:up] Update SESSION_SECRET in .env.docker (use a long random secret).",
    );
    process.exit(1);
  }
  if (invalid === "placeholder") {
    console.error(
      "[docker:up] Replace placeholder values in .env.docker (e.g. POSTGRES_PASSWORD, DATABASE_URL password).",
    );
    process.exit(1);
  }
}

function tryLaunchDockerDesktop() {
  if (noLaunch) {
    console.log("[docker:up] --no-launch: skipping automatic Docker Desktop start.");
    return false;
  }

  if (isWin) {
    const exe = firstExistingPath(
      dockerDesktopExeCandidates(),
      (p) => fs.existsSync(p),
    );

    if (!exe) {
      console.warn(
        "[docker:up] Docker Desktop executable not found in common install paths.",
      );
      return false;
    }
    console.log("[docker:up] Starting Docker Desktop…");
    const child = spawn(exe, [], { detached: true, stdio: "ignore" });
    child.unref();
    return true;
  }

  if (isMac) {
    console.log("[docker:up] Opening Docker Desktop…");
    const child = spawn("open", ["-a", "Docker"], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  }

  console.warn(
    "[docker:up] Start the Docker daemon (e.g. sudo systemctl start docker) and retry.",
  );
  return false;
}

async function waitForEngine() {
  if (dockerEngineOk()) {
    console.log("[docker:up] Docker engine is ready.");
    return true;
  }

  console.log(
    `[docker:up] Waiting for Docker engine (up to ${WAIT_ENGINE_MS / 1000}s)…`,
  );
  const deadline = Date.now() + WAIT_ENGINE_MS;
  while (Date.now() < deadline) {
    if (dockerEngineOk()) {
      console.log("\n[docker:up] Docker engine is ready.");
      return true;
    }
    process.stdout.write(".");
    await delay(WAIT_ENGINE_INTERVAL_MS);
  }
  console.error(
    "\n[docker:up] Timed out waiting for Docker. Start Docker Desktop or the Docker service, then run again.",
  );
  return false;
}

async function main() {
  console.log("[docker:up] AxTask Docker stack");

  if (!dockerCliOk()) {
    console.error(
      "[docker:up] Docker is not installed or not on PATH. Install Docker Desktop or Docker Engine + Compose v2.",
    );
    process.exit(1);
  }

  if (!composePluginOk()) {
    console.error(
      "[docker:up] Docker Compose v2 plugin missing. Install/update Docker Desktop or the compose plugin.",
    );
    process.exit(1);
  }

  ensureEnvDocker();
  validateEnvDocker();

  if (!dockerEngineOk()) {
    tryLaunchDockerDesktop();
  }

  const engineReady = await waitForEngine();
  if (!engineReady) {
    process.exit(1);
  }

  const composeArgs = ["compose", "--env-file", ".env.docker", "up", "-d"];
  if (!noBuild) {
    composeArgs.push("--build");
  }

  const upCode = runSync("Starting stack (docker compose up)", "docker", composeArgs);
  if (upCode !== 0) {
    process.exit(upCode);
  }

  runSync("Service status", "docker", [
    "compose",
    "--env-file",
    ".env.docker",
    "ps",
  ]);

  console.log("\n[docker:up] Open http://localhost:5000 when the app is healthy.");
}

main().catch((err) => {
  console.error("[docker:up] Unexpected error:", err);
  process.exit(1);
});
