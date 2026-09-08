#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const DURABLE_PROOF = /(?:operator-proof|artifact|workflow|run|commit|merge):\S+/;

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

function section(source, startHeading, endHeading) {
  const start = source.indexOf(startHeading);
  if (start < 0) throw new Error(`missing runbook section: ${startHeading}`);
  const end = source.indexOf(endHeading, start + startHeading.length);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

function fencedCommands(source) {
  return [...source.matchAll(/```[^\n]*\n([\s\S]*?)```/g)]
    .map((match) => match[1].trim())
    .filter(Boolean)
    .join("\n");
}

function normalize(text) {
  return String(text).toLowerCase().replace(/\s+/g, " ").trim();
}

function stripSqlComments(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

export function containsReclaimCommand(text) {
  const normalized = normalize(stripSqlComments(text));
  return /vacuum\s*\(\s*full\b|vacuum\s+full\b|db-reclaim-api-request/.test(normalized);
}

function runCli() {
const errors = [];
const requireText = (source, needle, label) => {
  if (!source.includes(needle)) errors.push(`${label}: missing '${needle}'`);
};

function field(source, name, label) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = [...source.matchAll(new RegExp(String.raw`^- \*\*${escaped}:\*\*\s*(.*)$`, "gm"))];
  if (matches.length === 0) {
    errors.push(`${label}: missing field '${name}'`);
    return "";
  }
  if (matches.length > 1) {
    errors.push(`${label}: duplicate field '${name}'`);
  }
  return matches[matches.length - 1][1].trim();
}

try {
  const queue = read(".ai/WORK_QUEUE.md");
  const runbook = read("docs/DB_RECOVERY_RUNBOOK.md");
  const wave = read("docs/DB_RECOVERY_SUBPART_WAVE.md");
  const backup = read("scripts/db/backup.mjs");
  const preflight = read("scripts/db/preflight-backup.mjs");
  const restore = read("scripts/db/restore-test.mjs");

  const r3 = block(queue, "AXQ-003");
  const r4 = block(queue, "AXQ-004");
  const r5 = block(queue, "AXQ-005");
  const r2 = block(queue, "AXQ-006");
  const r7 = block(queue, "AXQ-007");
  const r56 = block(queue, "AXQ-008");

  requireText(queue, "## Urgent recovery concurrency", "work queue");
  requireText(r3, "**Dependencies:** none", "AXQ-003");
  if (r3.includes("**Dependencies:** AXQ-002")) errors.push("AXQ-003 must not be serialized behind R1.5");

  const r3Scope = field(r3, "Scope", "AXQ-003");
  const r3Next = field(r3, "Next action", "AXQ-003");
  const r3Forbidden = field(r3, "Forbidden", "AXQ-003");
  const r56Scope = field(r56, "Scope", "AXQ-008");
  if (!/backup/i.test(r3Scope) || !/restore/i.test(r3Scope)) {
    errors.push("AXQ-003 Scope must identify R3 as backup and restore proof");
  }
  if (!/not physical reclaim/i.test(r3Scope)) {
    errors.push("AXQ-003 Scope must state that R3 is not physical reclaim");
  }
  const r3ScopeWithoutNegation = normalize(r3Scope).replace(/not physical reclaim/g, "");
  if (/reclaim/.test(r3ScopeWithoutNegation) || /reclaim/.test(normalize(r3Next))) {
    errors.push("AXQ-003 Scope/Next action must not assign reclaim to R3");
  }
  if (!/\breclaim\b/i.test(r3Forbidden)) {
    errors.push("AXQ-003 Forbidden must continue to exclude reclaim");
  }
  if (/\b(?:allow|allows|allowed|permit|permits|permitted)\b.{0,24}\breclaim\b|\breclaim\b.{0,24}\b(?:allow|allows|allowed|permit|permits|permitted)\b/i.test(r3Forbidden)) {
    errors.push("AXQ-003 Forbidden must exclude reclaim, not allow it");
  }
  if (!/physical reclaim/i.test(r56Scope)) {
    errors.push("AXQ-008 Scope must own physical reclaim");
  }

  const r7Ready = r7.includes("**Status:** READY");
  const r7Done = r7.includes("**Status:** DONE");
  if (!r7Ready && !r7Done) {
    errors.push("AXQ-007 must be READY for execution or DONE with durable proof");
  }
  if (r7Done) {
    if (!DURABLE_PROOF.test(r7)) errors.push("AXQ-007 DONE must include a durable proof token");
    requireText(r7, "**Next action:** none; no safe actionable work remains", "AXQ-007 DONE");
  }
  requireText(r7, "**Dependencies:** none", "AXQ-007");

  requireText(r2, "**Dependencies:** AXQ-001", "AXQ-006");
  requireText(r4, "**Dependencies:** AXQ-002, AXQ-003, AXQ-006", "AXQ-004");
  requireText(r56, "**Dependencies:** AXQ-004", "AXQ-008");
  requireText(r5, "**Dependencies:** AXQ-007, AXQ-008", "AXQ-005");

  requireText(runbook, "## Recovery acceleration — parallel sub-part wave", "runbook");
  requireText(runbook, "docs/DB_RECOVERY_SUBPART_WAVE.md", "runbook");

  const r3Runbook = section(runbook, "## R3 — backup and rollback proof", "## R4 — targeted logical cleanup");
  const r3Commands = fencedCommands(r3Runbook);
  requireText(r3Commands, "npm run db:backup:preflight -- --no-ledger", "runbook R3 commands");
  requireText(r3Commands, "npm run db:restore:test", "runbook R3 commands");
  requireText(r3Runbook, "not physical reclaim", "runbook R3");
  if (containsReclaimCommand(r3Commands)) {
    errors.push("runbook R3 commands must not include physical-reclaim operations");
  }
  if (/^\s*npm run db:backup\s*$/m.test(r3Commands)) {
    errors.push("runbook R3 must not execute a duplicate standalone db:backup after preflight");
  }

  requireText(wave, "Sub-Part Agent A — R3 backup/restore", "sub-part wave");
  requireText(wave, "not physical reclaim", "sub-part wave R3 naming");
  requireText(wave, "Sub-Part Agent B — R7 local certification", "sub-part wave");
  requireText(wave, "Sub-Part Agent C — R1.5 evidence preservation", "sub-part wave");
  requireText(wave, "Sub-Part Agent D — R2 containment", "sub-part wave");
  requireText(wave, 'AXTASK_BACKUP_MANIFEST=', "sub-part R3 exact-manifest handoff");
  requireText(wave, 'npm run db:restore:test -- --recovery --file="<exact manifest path>"', "sub-part R3 restore command");
  requireText(wave, "R1.5 preservation complete", "sub-part convergence");
  requireText(wave, "R3 raw backup + disposable restore complete", "sub-part convergence");
  requireText(wave, "R2 containment origin-active", "sub-part convergence");

  requireText(backup, 'process.argv.includes("--no-ledger")', "backup tool");
  requireText(backup, 'recoveryMode = noLedger', "backup recovery mode");
  requireText(backup, 'sourceLedgerMode: noLedger ? "skipped" : "attempted"', "backup manifest");
  requireText(backup, "source ledger skipped (--no-ledger)", "backup tool");
  requireText(preflight, 'process.argv.includes("--no-ledger")', "backup preflight");
  requireText(preflight, '["--no-ledger"]', "backup preflight forwarding");
  requireText(preflight, 'AXTASK_BACKUP_MANIFEST=', "backup preflight exact-manifest output");
  requireText(preflight, 'manifest.sourceLedgerMode !== "skipped"', "backup preflight proof");
  requireText(restore, 'process.argv.includes("--recovery")', "restore recovery gate");
  requireText(restore, 'recovery restore requires --file=<exact manifest path>', "restore exact-manifest gate");
  requireText(restore, '!manifest.databaseFingerprint || manifest.databaseFingerprint !== sourceFingerprint', "restore source binding");
} catch (err) {
  errors.push(err.message);
}

if (errors.length) {
  console.error(`[recovery-wave] FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("[recovery-wave] PASS parallel post-R1 recovery contract");
}

const invokedPath = process.argv[1] ? path.normalize(path.resolve(process.argv[1])) : "";
if (invokedPath && invokedPath === path.normalize(path.resolve(fileURLToPath(import.meta.url)))) {
  runCli();
}
