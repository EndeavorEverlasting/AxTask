#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const manifestPath = path.join(repoRoot, ".ai", "repo-ledger-adoption.json");
const expectedContractCommit = "3188d577dbda1994c0629c1416ae3362198812dd";
const expectedDonorCommit = "9351c952b057ae4520b1ea0d388e1d8908f4c093";
const expectedDonorPaths = [
  ".ai/README.md",
  ".ai/WORK_QUEUE.md",
  ".ai/authority.json",
  "scripts/ai-harness/validate-work-queue.mjs",
];
const failures = [];

function fail(message) {
  failures.push(message);
}

function isExactCommit(value) {
  return /^[0-9a-f]{40}$/.test(String(value || ""));
}

if (!fs.existsSync(manifestPath)) {
  console.error("[repo-ledger-adoption] missing .ai/repo-ledger-adoption.json");
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`[repo-ledger-adoption] invalid JSON: ${error.message}`);
  process.exit(1);
}

if (manifest.schema !== "RepoLedgerAdoption.v1") fail("schema must be RepoLedgerAdoption.v1");
if (manifest.repository !== "EndeavorEverlasting/AxTask") fail("repository identity drifted");
if (manifest.adoptionStatus !== "native_donor") fail("AxTask adoption status must remain native_donor");
if (manifest.contract?.repository !== "EndeavorEverlasting/BlacksmithGuild") fail("shared contract owner drifted");
if (manifest.contract?.commit !== expectedContractCommit) fail("shared contract pin drifted; explicit compatibility update required");
if (!isExactCommit(manifest.contract?.commit)) fail("shared contract must use an exact 40-hex commit pin");
if (manifest.contract?.path !== ".tbg/workflows/repo-ledger-interoperability.contract.json") fail("shared contract path drifted");
if (manifest.contract?.version !== "RepoLedgerInteroperability.v1") fail("shared contract version drifted");
if (manifest.donor?.repository !== "EndeavorEverlasting/AxTask") fail("donor repository drifted");
if (manifest.donor?.commit !== expectedDonorCommit) fail("donor pin drifted; a new shared-contract version is required");
if (!isExactCommit(manifest.donor?.commit)) fail("donor must use an exact 40-hex commit pin");

const donorPaths = Array.isArray(manifest.donor?.sourcePaths) ? manifest.donor.sourcePaths : [];
if (donorPaths.length !== expectedDonorPaths.length || expectedDonorPaths.some((item) => !donorPaths.includes(item))) {
  fail("donor source paths do not match the v1 provenance set");
}

if (manifest.local?.ledgerPath !== ".ai/WORK_QUEUE.md") fail("local ledger path drifted");
if (manifest.local?.validatorPath !== "scripts/ai-harness/validate-work-queue.mjs") fail("local authoritative validator path drifted");
if (manifest.local?.taskNamespace !== "AXQ") fail("AXQ namespace drifted");
if (manifest.local?.format !== "markdown") fail("local ledger format drifted");
if (manifest.authority?.runtimeOwner !== "EndeavorEverlasting/AxTask") fail("AxTask must remain runtime/task owner");
if (manifest.authority?.contractOwner !== "EndeavorEverlasting/BlacksmithGuild") fail("portable contract owner drifted");
if (manifest.authority?.noCircularAuthority !== true) fail("noCircularAuthority must be true");
if (manifest.proofCeiling !== "repository_harness_only") fail("adoption proof ceiling drifted");

for (const badRef of ["main", "master", "HEAD", "feat/repo-ledger", "v1.0.0", "3188d577dbda"]) {
  if (isExactCommit(badRef)) fail(`symbolic/short stale-reference probe unexpectedly accepted '${badRef}'`);
}

for (const localPath of [manifest.local?.ledgerPath, manifest.local?.validatorPath]) {
  if (!localPath || !fs.existsSync(path.join(repoRoot, localPath))) fail(`missing local adoption path: ${localPath || "<blank>"}`);
}

if (failures.length > 0) {
  console.error(`[repo-ledger-adoption] FAIL (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const queueValidator = path.join(repoRoot, manifest.local.validatorPath);
const queueResult = spawnSync(process.execPath, [queueValidator], {
  cwd: repoRoot,
  stdio: "inherit",
});
if (queueResult.error) {
  console.error(`[repo-ledger-adoption] failed to launch local queue validator: ${queueResult.error.message}`);
  process.exit(1);
}
if (queueResult.status !== 0) {
  console.error(`[repo-ledger-adoption] local queue validator exited ${queueResult.status}`);
  process.exit(queueResult.status ?? 1);
}

console.log(`[repo-ledger-adoption] PASS contract=${expectedContractCommit.slice(0, 12)} donor=${expectedDonorCommit.slice(0, 12)} namespace=AXQ`);
