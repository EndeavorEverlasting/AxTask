#!/usr/bin/env node
import "dotenv/config";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { latestDbManifest } from "./pg-tools.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function validateEnvironment() {
  const dbUrl = process.env.DATABASE_URL || "";
  if (dbUrl.includes("neon.tech") && process.env.ALLOW_PRODUCTION_TEST !== "1") {
    console.error("[backup-cert] ERROR: Rejection triggered. Production/Neon DATABASE_URL detected.");
    process.exit(1);
  }
  if (process.env.RENDER === "true" || process.env.AXTASK_PRODUCTION === "true") {
    console.error("[backup-cert] ERROR: Rejection triggered. Production host environment detected.");
    process.exit(1);
  }
}

function runStep(name, cmd, args, env = {}) {
  console.log(`[backup-cert] Step: ${name}...`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    console.error(`[backup-cert] FAILED step ${name}: ${r.stderr || r.stdout}`);
    return { ok: false, output: r.stderr || r.stdout, status: r.status };
  }
  return { ok: true, output: r.stdout, status: 0 };
}

function main() {
  console.log("[backup-cert] Starting local backup/restore certification...");
  validateEnvironment();

  const runId = `backup-cert-${Date.now()}`;
  const runDir = path.join(root, ".ai", "runs", runId);
  mkdirSync(runDir, { recursive: true });

  const steps = [];

  // Step 1: Preflight backup
  const preflight = runStep("db:backup:preflight", "node", ["scripts/db/preflight-backup.mjs"]);
  steps.push({ step: "preflight", ...preflight });

  // Step 2: Manifest discovery & verification
  const manifestPath = latestDbManifest();
  let manifestOk = false;
  let manifestData = null;
  if (manifestPath && existsSync(manifestPath)) {
    manifestData = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifestData.dumpFile && existsSync(manifestData.dumpFile)) {
      manifestOk = true;
    }
  }
  steps.push({ step: "manifest-verification", ok: manifestOk, path: manifestPath });

  // Step 3: Optional restore test if RESTORE_DATABASE_URL is available
  let restoreOk = true;
  let restoreSkipped = false;
  if (process.env.RESTORE_DATABASE_URL && process.env.RESTORE_DATABASE_URL !== process.env.DATABASE_URL) {
    const restoreRes = runStep("db:restore:test", "node", ["scripts/db/restore-test.mjs"]);
    restoreOk = restoreRes.ok;
    steps.push({ step: "restore-test", ...restoreRes });
  } else {
    restoreSkipped = true;
    steps.push({ step: "restore-test", ok: true, skipped: true, reason: "RESTORE_DATABASE_URL not configured or equals DATABASE_URL" });
  }

  const overallOk = manifestOk && restoreOk;
  const proof = {
    schemaVersion: 1,
    authorityRef: "axtask.agent-authority.v1",
    runId,
    capabilityId: "backup-restore-local-certification",
    timestamp: new Date().toISOString(),
    status: overallOk ? "PASSED" : "FAILED",
    proofLevel: restoreSkipped ? "static-manifest-verified" : "local-disposable-runtime",
    steps,
  };

  const proofPath = path.join(runDir, "runtime-proof.json");
  writeFileSync(proofPath, JSON.stringify(proof, null, 2) + "\n");

  const reportMd = `# Local Backup/Restore Certification Report

- **Run ID:** ${runId}
- **Timestamp:** ${new Date().toISOString()}
- **Status:** ${overallOk ? "PASSED" : "FAILED"}
- **Proof Level:** ${proof.proofLevel}

## Steps Summary

${steps.map((s) => `- **${s.step}:** ${s.ok ? "OK" : "FAILED"}${s.skipped ? " (Skipped)" : ""}`).join("\n")}

## Artifacts Produced

- Proof: \`${proofPath}\`
`;

  const reportPath = path.join(runDir, "backup-cert-report.md");
  writeFileSync(reportPath, reportMd);

  console.log(`[backup-cert] Certification finished. Status: ${overallOk ? "PASSED" : "FAILED"}`);
  console.log(`[backup-cert] Proof saved to ${proofPath}`);

  if (!overallOk) {
    process.exit(1);
  }
}

main();
