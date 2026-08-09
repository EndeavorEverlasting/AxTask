#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const fixturePaths = [
  ".ai/WORK_QUEUE.md",
  ".ai/repo-ledger-adoption.json",
  "scripts/ai-harness/validate-work-queue.mjs",
  "scripts/ai-harness/validate-repo-ledger-adoption.mjs",
];

function copyFixture(root) {
  for (const relativePath of fixturePaths) {
    const source = path.join(repoRoot, relativePath);
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function runFixture(mutator) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-ledger-test-"));
  try {
    copyFixture(root);
    if (mutator) mutator(root);
    return spawnSync(process.execPath, [path.join(root, "scripts/ai-harness/validate-repo-ledger-adoption.mjs")], {
      cwd: root,
      encoding: "utf8",
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const happy = runFixture();
assert.equal(happy.status, 0, `happy path failed:\n${happy.stdout}\n${happy.stderr}`);
assert.match(happy.stdout, /\[repo-ledger-adoption\] PASS/);
assert.match(happy.stdout, /\[work-queue\] PASS/);

const stalePin = runFixture((root) => {
  const manifestPath = path.join(root, ".ai/repo-ledger-adoption.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.contract.commit = "main";
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
});
assert.notEqual(stalePin.status, 0, "symbolic contract pin unexpectedly passed");
assert.match(`${stalePin.stdout}\n${stalePin.stderr}`, /contract pin drifted|exact 40-hex/);

const missingDoneProof = runFixture((root) => {
  const queuePath = path.join(root, ".ai/WORK_QUEUE.md");
  const source = fs.readFileSync(queuePath, "utf8").trimEnd();
  const regressionTask = `

## AXQ-999 — Regression fixture rejects DONE without durable proof

- **Status:** DONE
- **Priority:** P3
- **Owner:** repo-ledger-regression-fixture
- **Branch / PR:** fixture-only
- **Scope:** synthetic validator fixture for strict DONE proof rejection
- **Forbidden:** product mutation; deployment mutation; production state changes
- **Dependencies:** none
- **References:** .ai/WORK_QUEUE.md
- **Acceptance gate:** the native AxTask queue validator rejects this synthetic DONE task because durable proof is absent
- **Gate:** none
- **Last proof:** none
- **Next action:** none; no safe actionable work remains
- **Updated:** 2026-08-09
`;
  fs.writeFileSync(queuePath, `${source}${regressionTask}\n`, "utf8");
});
assert.notEqual(missingDoneProof.status, 0, "DONE without durable proof unexpectedly passed");
assert.match(`${missingDoneProof.stdout}\n${missingDoneProof.stderr}`, /DONE requires durable Last proof|DONE Last proof must include a durable evidence token/);

console.log("[repo-ledger-adoption-test] PASS happy=1 stale-pin=1 done-proof=1");
