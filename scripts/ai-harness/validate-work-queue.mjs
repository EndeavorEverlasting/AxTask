#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function parseArgs(argv) {
  const args = new Map();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [name, inlineValue] = arg.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      args.set(name, inlineValue);
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args.set(name, next);
      i += 1;
    } else {
      args.set(name, true);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const queuePath = path.resolve(repoRoot, String(args.get("file") || ".ai/WORK_QUEUE.md"));

const allowedStatuses = new Set([
  "READY",
  "CLAIMED",
  "VERIFY",
  "REVIEW",
  "MERGE",
  "OPERATOR",
  "BLOCKED",
  "DONE",
]);
const allowedPriorities = new Set(["P0", "P1", "P2", "P3"]);
const continuationStatuses = new Set(["READY", "CLAIMED", "VERIFY", "REVIEW", "MERGE"]);
const requiredFields = [
  "Status",
  "Priority",
  "Owner",
  "Branch / PR",
  "Scope",
  "Forbidden",
  "Dependencies",
  "References",
  "Acceptance gate",
  "Gate",
  "Last proof",
  "Next action",
  "Updated",
];

const errors = [];

function fail(message) {
  errors.push(message);
}

function hasDurableProofReference(proof) {
  return [
    /\b(?:commit|merge):[0-9a-f]{7,40}\b/i,
    /\b(?:workflow|run):#?\d+\b/i,
    /\bartifact:\S+/i,
    /\boperator-proof:\S+/i,
  ].some((pattern) => pattern.test(proof));
}

if (!fs.existsSync(queuePath)) {
  console.error(`[work-queue] missing: ${path.relative(repoRoot, queuePath)}`);
  process.exit(1);
}

const source = fs.readFileSync(queuePath, "utf8");

for (const phrase of [
  "authorityRef: axtask.agent-authority.v1",
  "Continuation states are not stopping states.",
  "PR opened is not completion.",
  "DONE is strict.",
  "none; no safe actionable work remains",
]) {
  if (!source.includes(phrase)) fail(`missing queue contract phrase: ${phrase}`);
}

const canonicalHeadingPattern = /^## (AXQ-\d{3,}) — (.+)$/;
const allAxqHeadings = [...source.matchAll(/^##\s+(AXQ-[^\n]*)$/gm)];
for (const heading of allAxqHeadings) {
  if (!canonicalHeadingPattern.test(heading[0])) {
    fail(`malformed AXQ heading: '${heading[0]}' (expected '## AXQ-### — Title')`);
  }
}

const headingRegex = /^## (AXQ-\d{3,}) — (.+)$/gm;
const matches = [...source.matchAll(headingRegex)];
if (matches.length === 0) fail("queue must contain at least one canonical AXQ task block");

const ids = new Set();
for (let index = 0; index < matches.length; index += 1) {
  const match = matches[index];
  const id = match[1];
  const title = match[2].trim();
  const start = match.index;
  const end = matches[index + 1]?.index ?? source.length;
  const block = source.slice(start, end);

  if (ids.has(id)) fail(`${id}: duplicate task id`);
  ids.add(id);
  if (!title) fail(`${id}: title is empty`);

  const fields = new Map();
  for (const fieldMatch of block.matchAll(/^- \*\*([^*]+):\*\*[ \t]*(.*)$/gm)) {
    fields.set(fieldMatch[1].trim(), fieldMatch[2].trim());
  }

  for (const field of requiredFields) {
    if (!fields.has(field)) {
      fail(`${id}: missing field '${field}'`);
      continue;
    }
    if (!fields.get(field)?.trim()) {
      fail(`${id}: required field '${field}' must not be blank`);
    }
  }

  const status = fields.get("Status") || "";
  const priority = fields.get("Priority") || "";
  const owner = fields.get("Owner") || "";
  const gate = fields.get("Gate") || "";
  const proof = fields.get("Last proof") || "";
  const nextAction = fields.get("Next action") || "";

  if (status && !allowedStatuses.has(status)) {
    fail(`${id}: invalid status '${status}'`);
  }
  if (priority && !allowedPriorities.has(priority)) {
    fail(`${id}: invalid priority '${priority}'`);
  }
  if (status === "CLAIMED" && (!owner || owner === "unclaimed")) {
    fail(`${id}: CLAIMED tasks require a concrete owner/session`);
  }
  if (continuationStatuses.has(status) && (!nextAction || nextAction === "none; no safe actionable work remains")) {
    fail(`${id}: ${status} is a continuation state and requires an executable next action`);
  }
  if ((status === "BLOCKED" || status === "OPERATOR") && (!gate || gate === "none")) {
    fail(`${id}: ${status} requires an exact Gate`);
  }
  if (status === "DONE") {
    if (!proof || proof === "none") {
      fail(`${id}: DONE requires durable Last proof`);
    } else if (!hasDurableProofReference(proof)) {
      fail(
        `${id}: DONE Last proof must include a durable evidence token (commit:<sha>, merge:<sha>, workflow:<id>, run:<id>, artifact:<ref>, or operator-proof:<ref>)`,
      );
    }
    if (gate !== "none") fail(`${id}: DONE requires Gate: none`);
    if (nextAction !== "none; no safe actionable work remains") {
      fail(`${id}: DONE requires the canonical no-work-remains Next action`);
    }
  }
}

if (errors.length > 0) {
  console.error(`[work-queue] FAIL (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`[work-queue] PASS ${path.relative(repoRoot, queuePath)} (${matches.length} tasks)`);
