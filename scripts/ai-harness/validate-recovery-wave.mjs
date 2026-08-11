#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function read(rel) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) throw new Error(`missing required recovery-wave file: ${rel}`);
  return fs.readFileSync(full, "utf8");
}

function block(source, id) {
  const start = source.indexOf(`## ${id} —`);
  if (start < 0) throw new Error(`missing work-queue task: ${id}`);
  const rest = source.slice(start);
  const next = rest.slice(1).search(/\n## AXQ-\d{3,} —/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

const errors = [];
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) errors.push(`${label}: missing '${needle}'`);
};

try {
  const queue = read(".ai/WORK_QUEUE.md");
  const runbook = read("docs/DB_RECOVERY_RUNBOOK.md");
  const wave = read("docs/DB_RECOVERY_SUBPART_WAVE.md");
  const backup = read("scripts/db/backup.mjs");
  const preflight = read("scripts/db/preflight-backup.mjs");

  const r3 = block(queue, "AXQ-003");
  const r4 = block(queue, "AXQ-004");
  const r5 = block(queue, "AXQ-005");
  const r2 = block(queue, "AXQ-006");
  const r7 = block(queue, "AXQ-007");
  const r56 = block(queue, "AXQ-008");

  requireText(queue, "## Urgent recovery concurrency", "work queue");
  requireText(r3, "**Dependencies:** none", "AXQ-003");
  if (r3.includes("**Dependencies:** AXQ-002")) errors.push("AXQ-003 must not be serialized behind R1.5");
  requireText(r7, "**Status:** READY", "AXQ-007");
  requireText(r7, "**Dependencies:** none", "AXQ-007");
  requireText(r2, "**Dependencies:** AXQ-001", "AXQ-006");
  requireText(r4, "**Dependencies:** AXQ-002, AXQ-003, AXQ-006", "AXQ-004");
  requireText(r56, "**Dependencies:** AXQ-004", "AXQ-008");
  requireText(r5, "**Dependencies:** AXQ-007, AXQ-008", "AXQ-005");

  requireText(runbook, "## Recovery acceleration — parallel sub-part wave", "runbook");
  requireText(runbook, "npm run db:backup:preflight -- --no-ledger", "runbook R3");
  if (/npm run db:backup:preflight[\s\S]{0,200}npm run db:backup\b/.test(runbook)) {
    errors.push("runbook R3 must not create a duplicate second backup after preflight");
  }
  requireText(runbook, "docs/DB_RECOVERY_SUBPART_WAVE.md", "runbook");

  requireText(wave, "Sub-Part Agent A — R3 backup/restore", "sub-part wave");
  requireText(wave, "Sub-Part Agent B — R7 local certification", "sub-part wave");
  requireText(wave, "Sub-Part Agent C — R1.5 evidence preservation", "sub-part wave");
  requireText(wave, "Sub-Part Agent D — R2 containment", "sub-part wave");
  requireText(wave, "R1.5 preservation complete", "sub-part convergence");
  requireText(wave, "R3 raw backup + disposable restore complete", "sub-part convergence");
  requireText(wave, "R2 containment origin-active", "sub-part convergence");

  requireText(backup, 'process.argv.includes("--no-ledger")', "backup tool");
  requireText(backup, 'sourceLedgerMode: noLedger ? "skipped" : "attempted"', "backup manifest");
  requireText(backup, "source ledger skipped (--no-ledger)", "backup tool");
  requireText(preflight, 'process.argv.includes("--no-ledger")', "backup preflight");
  requireText(preflight, '["--no-ledger"]', "backup preflight forwarding");
  requireText(preflight, 'manifest.sourceLedgerMode !== "skipped"', "backup preflight proof");
} catch (err) {
  errors.push(err.message);
}

if (errors.length) {
  console.error(`[recovery-wave] FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("[recovery-wave] PASS parallel post-R1 recovery contract");
