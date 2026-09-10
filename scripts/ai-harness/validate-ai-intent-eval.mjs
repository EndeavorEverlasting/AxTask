#!/usr/bin/env node
/**
 * Harness validator: offline AI intent eval pack + wiring completeness.
 * Runs the deterministic eval gate (no live OpenAI).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

const required = [
  "evals/ai-intent/manifest.v1.json",
  "evals/ai-intent/rubrics/v1.json",
  "evals/ai-intent/baselines/v1/latest.json",
  "scripts/ai-eval/run-ai-intent-eval.mjs",
  "scripts/ai-eval/compare-baseline.mjs",
  "server/ai-eval/run-pack.ts",
  "server/ai-eval/scorers.ts",
  "server/ai-eval/fixture-provider.ts",
  "server/ai-eval/ai-intent-eval.contract.test.ts",
  ".ai/schemas/ai-intent-eval-result.schema.json",
  ".ai/workflows/ai-intent-eval.md",
];

const errors = [];
for (const rel of required) {
  if (!fs.existsSync(path.join(REPO_ROOT, rel))) {
    errors.push(`missing required file: ${rel}`);
  }
}

const manifestPath = path.join(REPO_ROOT, "evals/ai-intent/manifest.v1.json");
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.packId !== "axtask.ai-intent.v1") {
      errors.push(`unexpected packId: ${manifest.packId}`);
    }
    if (!Array.isArray(manifest.caseIds) || manifest.caseIds.length < 8) {
      errors.push("manifest.caseIds must list a representative case pack");
    }
  } catch (err) {
    errors.push(`manifest parse error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (errors.length) {
  console.error("[validate-ai-intent-eval] FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const run = spawnSync(
  process.execPath,
  [path.join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs"), "scripts/ai-eval/run-ai-intent-eval.mjs"],
  { cwd: REPO_ROOT, stdio: "inherit", env: { ...process.env, AXTASK_AI_EVAL_LIVE: "0" } },
);

if (run.status !== 0) {
  console.error("[validate-ai-intent-eval] eval runner failed");
  process.exit(run.status ?? 1);
}

console.log("[validate-ai-intent-eval] OK");
process.exit(0);
