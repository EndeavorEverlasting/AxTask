#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const runsRoot = path.join(root, ".ai", "runs");
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function gitSha() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "unknown-local-candidate";
}

export function validateLocalDatabaseUrl(raw) {
  if (!raw) return { ok: false, reason: "DATABASE_URL is required." };
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "DATABASE_URL is not a valid URL." };
  }
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) {
    return { ok: false, reason: "DATABASE_URL must use PostgreSQL." };
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    return { ok: false, reason: "Local certification accepts only loopback PostgreSQL hosts." };
  }
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName || !/(axtask|test|ci|dev)/i.test(databaseName)) {
    return { ok: false, reason: "Database name must clearly identify an AxTask/test/CI/dev database." };
  }
  return { ok: true, databaseName };
}

export function buildLocalCertificationEnv(baseEnv, port) {
  return {
    ...baseEnv,
    NODE_ENV: "production",
    PORT: String(port),
    SESSION_SECRET: "local-cert-session-secret-not-for-production-use",
    AUTH_AUDIT_PEPPER: "local-cert-auth-audit-pepper-not-for-production",
    ARCHETYPE_ANALYTICS_SALT: "local-cert-archetype-salt",
    TOTP_ENCRYPTION_KEY: "0".repeat(64),
    REGISTRATION_MODE: "closed",
    FORCE_HTTPS: "false",
    AXTASK_SKIP_DB_CAPACITY_CHECK: "true",
    SKIP_DB_PUSH_ON_START: "true",
    DISABLE_DEV_SEED: "true",
    DISABLE_REMINDER_DISPATCH: "true",
    DISABLE_ARCHETYPE_ROLLUP: "true",
    DISABLE_RETENTION_PRUNE: "true",
    DISABLE_DB_SIZE_SNAPSHOT: "true",
    DISABLE_OPS_SNAPSHOT: "true",
    AXTASK_ARCHETYPE_POLL_SCHEDULER: "0",
    BACKUP_SCHEDULER_ENABLED: "false",
    BACKUP_QUEUE_WORKER_ENABLED: "false",
    BACKUP_BULLMQ_ENABLED: "false",
    SECURITY_API_REQUEST_LOGGING: "false",
    ADHERENCE_INTERVENTIONS_ENABLED: "false",
    RENDER: "false",
    AXTASK_PRODUCTION: "false",
  };
}

function runCommand(name, command, args, env = process.env) {
  console.log(`[local-cert] ${name}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
  });
  return { ok: result.status === 0, exitCode: result.status ?? 1 };
}

async function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function probe(url, predicate, child, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return { ok: false, evidence: `launcher exited with code ${child.exitCode}` };
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
      if (predicate(response, body)) {
        return { ok: true, evidence: `HTTP ${response.status}` };
      }
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.name : "request failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ok: false, evidence: `timed out (${last})` };
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null || !child.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    try {
      child.kill("SIGTERM");
    } catch {
      return;
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        // Already stopped.
      }
    }
  }
}

function writeProof({ runDir, candidateSha, startedAt, assertions, failures, commands, skippedEvidence, attainedProofLevel }) {
  const proofPath = path.join(runDir, "runtime-proof.json");
  const reportPath = path.join(runDir, "local-cert-report.md");
  const proof = {
    schemaVersion: 1,
    authorityRef: "axtask.agent-authority.v1",
    schemaId: "axtask.runtime-proof.v1",
    candidateSha,
    environmentClass: "local",
    commands,
    timestamps: { startedAt, finishedAt: new Date().toISOString() },
    sanitizedArtifacts: [
      path.relative(root, proofPath).replace(/\\/g, "/"),
      path.relative(root, reportPath).replace(/\\/g, "/"),
    ],
    assertions,
    failures,
    skippedEvidence,
    attainedProofLevel,
    proofCeiling: "local-runtime",
    observedEndpoints: assertions
      .filter((item) => item.id === "health" || item.id === "ready" || item.id === "root-smoke")
      .map((item) => item.id === "health" ? "/health" : item.id === "ready" ? "/ready" : "/"),
    operatorAcceptance: {
      accepted: false,
      reason: "Local certification only; no live deployment authorization or operator acceptance was requested.",
    },
  };
  fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8");
  const status = failures.length === 0 && assertions.every((item) => item.passed) ? "GO_LOCAL_RUNTIME" : "NO_GO_LOCAL_RUNTIME";
  fs.writeFileSync(
    reportPath,
    [
      "# Local Production Certification",
      "",
      `- Candidate: \`${candidateSha}\``,
      `- Status: **${status}**`,
      `- Attained proof: \`${attainedProofLevel}\``,
      "- Proof ceiling: `local-runtime`",
      "",
      "## Assertions",
      "",
      ...assertions.map((item) => `- ${item.passed ? "PASS" : "FAIL"}: ${item.description} (${item.evidence})`),
      "",
      "## Failures",
      "",
      ...(failures.length ? failures.map((item) => `- ${item.severity}: ${item.description}`) : ["- none"]),
      "",
      "## Skipped evidence",
      "",
      ...skippedEvidence.map((item) => `- ${item}`),
      "",
      "## Boundary",
      "",
      "This run uses only a disposable loopback PostgreSQL target and a local production-mode process. It does not contact or certify Render, Neon production, DNS, production traffic, deployment completion, or operator acceptance.",
      "",
    ].join("\n"),
    "utf8",
  );
  return { proofPath, reportPath, status };
}

export async function runLocalCertification({ schemaReady = false, buildReady = false } = {}) {
  const startedAt = new Date().toISOString();
  const candidateSha = process.env.AXTASK_CANDIDATE_SHA || gitSha();
  const runId = `local-cert-${startedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const runDir = path.join(runsRoot, runId);
  fs.mkdirSync(runDir, { recursive: true });
  const commands = [];
  const assertions = [];
  const failures = [];
  const skippedEvidence = ["Runtime memory trend: NOT_ENOUGH_SAMPLES in bounded startup certification."];

  const allowed = process.env.AXTASK_LOCAL_CERT === "1";
  assertions.push({
    id: "local-allow-marker",
    description: "Explicit local certification allow marker is present",
    passed: allowed,
    evidence: allowed ? "AXTASK_LOCAL_CERT=1" : "AXTASK_LOCAL_CERT is not 1",
  });

  const productionMarkersClear = process.env.RENDER !== "true" && process.env.AXTASK_PRODUCTION !== "true";
  assertions.push({
    id: "production-host-gate",
    description: "Production host markers are absent",
    passed: productionMarkersClear,
    evidence: productionMarkersClear ? "no production host marker" : "production host marker detected",
  });

  const dbGate = validateLocalDatabaseUrl(process.env.DATABASE_URL);
  assertions.push({
    id: "disposable-db-gate",
    description: "Database target is loopback and clearly disposable",
    passed: dbGate.ok,
    evidence: dbGate.ok ? `loopback database ${dbGate.databaseName}` : dbGate.reason,
  });

  if (!allowed || !productionMarkersClear || !dbGate.ok) {
    failures.push({ id: "environment-gate", description: "Local certification environment gate failed.", severity: "blocking" });
    const artifact = writeProof({ runDir, candidateSha, startedAt, assertions, failures, commands: ["local certification environment gate"], skippedEvidence, attainedProofLevel: "contract" });
    return { ok: false, ...artifact };
  }

  const port = await reservePort();
  const childEnv = buildLocalCertificationEnv(process.env, port);

  if (!schemaReady) {
    commands.push("npm run db:push:ci", "node scripts/apply-migrations.mjs", "npm run db:push:ci");
    const bootstrap = runCommand("Drizzle schema bootstrap", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "db:push:ci"], childEnv);
    assertions.push({ id: "schema-bootstrap", description: "Disposable schema bootstrap succeeds", passed: bootstrap.ok, evidence: `exit ${bootstrap.exitCode}` });
    if (!bootstrap.ok) failures.push({ id: "schema-bootstrap", description: "Disposable schema bootstrap failed.", severity: "blocking" });
    const migrations = bootstrap.ok ? runCommand("Numbered migrations", process.execPath, ["scripts/apply-migrations.mjs"], childEnv) : { ok: false, exitCode: 1 };
    assertions.push({ id: "migrations", description: "Numbered migrations succeed", passed: migrations.ok, evidence: `exit ${migrations.exitCode}` });
    if (!migrations.ok) failures.push({ id: "migrations", description: "Numbered migrations failed.", severity: "blocking" });
    const idempotent = migrations.ok ? runCommand("Idempotent Drizzle push", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "db:push:ci"], childEnv) : { ok: false, exitCode: 1 };
    assertions.push({ id: "schema-idempotence", description: "Second schema push is idempotent", passed: idempotent.ok, evidence: `exit ${idempotent.exitCode}` });
    if (!idempotent.ok) failures.push({ id: "schema-idempotence", description: "Idempotent schema verification failed.", severity: "blocking" });
  } else {
    assertions.push({ id: "schema-prepared", description: "Disposable schema was prepared by the caller", passed: true, evidence: "--schema-ready" });
  }

  if (!buildReady) {
    commands.push("npm run build");
    const build = runCommand("Production build", process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], childEnv);
    assertions.push({ id: "production-build", description: "Production build succeeds", passed: build.ok, evidence: `exit ${build.exitCode}` });
    if (!build.ok) failures.push({ id: "production-build", description: "Production build failed.", severity: "blocking" });
  } else {
    assertions.push({ id: "build-prepared", description: "Production build was prepared by the caller", passed: true, evidence: "--build-ready" });
  }

  let launcher = null;
  if (failures.length === 0) {
    commands.push("node scripts/production-start.mjs");
    launcher = spawn(process.execPath, ["scripts/production-start.mjs"], {
      cwd: root,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    launcher.stdout?.resume();
    launcher.stderr?.resume();

    try {
      const base = `http://127.0.0.1:${port}`;
      const health = await probe(`${base}/health`, (response, body) => response.status === 200 && body?.status === "ok", launcher);
      assertions.push({ id: "health", description: "DB-free /health reports process liveness", passed: health.ok, evidence: health.evidence });
      if (!health.ok) failures.push({ id: "health", description: "Local /health probe failed.", severity: "blocking" });

      const ready = health.ok
        ? await probe(`${base}/ready`, (response, body) => response.status === 200 && body?.status === "ready", launcher)
        : { ok: false, evidence: "skipped because /health failed" };
      assertions.push({ id: "ready", description: "DB-backed /ready reports disposable database readiness", passed: ready.ok, evidence: ready.evidence });
      if (!ready.ok) failures.push({ id: "ready", description: "Local /ready probe failed.", severity: "blocking" });

      const rootSmoke = ready.ok
        ? await probe(`${base}/`, (response, body) => response.status === 200 && typeof body === "string" && body.toLowerCase().includes("<!doctype html"), launcher)
        : { ok: false, evidence: "skipped because /ready failed" };
      assertions.push({ id: "root-smoke", description: "Built client shell is served in production mode", passed: rootSmoke.ok, evidence: rootSmoke.evidence });
      if (!rootSmoke.ok) failures.push({ id: "root-smoke", description: "Local production client-shell smoke failed.", severity: "blocking" });
    } finally {
      await stopProcessTree(launcher);
    }
  }

  const allPassed = failures.length === 0 && assertions.every((item) => item.passed);
  const attainedProofLevel = allPassed ? "local-runtime" : launcher ? "launcher" : buildReady ? "build" : "static-test";
  const artifact = writeProof({ runDir, candidateSha, startedAt, assertions, failures, commands, skippedEvidence, attainedProofLevel });

  commands.push(`node scripts/ai-harness/validate-runtime-proof.mjs ${path.relative(root, artifact.proofPath).replace(/\\/g, "/")}`);
  const validation = runCommand(
    "Runtime-proof validation",
    process.execPath,
    ["scripts/ai-harness/validate-runtime-proof.mjs", artifact.proofPath],
    childEnv,
  );
  if (!validation.ok) return { ok: false, ...artifact, proofValidationExitCode: validation.exitCode };
  return { ok: allPassed, ...artifact };
}

async function main() {
  const schemaReady = process.argv.includes("--schema-ready");
  const buildReady = process.argv.includes("--build-ready");
  const result = await runLocalCertification({ schemaReady, buildReady });
  console.log(`[local-cert] ${result.status}`);
  console.log(`[local-cert] proof: ${path.relative(root, result.proofPath).replace(/\\/g, "/")}`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`[local-cert] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
