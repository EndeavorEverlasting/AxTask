#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSurface } from "./validate-stateful-surface.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const CONTRACT_PATH = ".ai/stateful-execution-contract.json";
const SURFACE_DIR = ".ai/architecture/surfaces";

function readJson(root, rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
}

function loadSurface(root, id) {
  const rel = `${SURFACE_DIR}/${id}.json`;
  return { rel, task: readJson(root, rel) };
}

function evidenceTask(surface, gap) {
  return {
    taskType: "EVIDENCE",
    surfaceId: surface.surfaceId,
    gapId: gap.id,
    status: "EVIDENCE_REQUIRED",
    ownedPaths: gap.exactFiles,
    question: gap.question,
    doNow: `Inspect only the exact files for ${surface.surfaceId}:${gap.id}. Update only evidenceGaps.${gap.id} in ${surface.artifactPath}; set that gap to resolved only when repository evidence is recorded.`,
    doNot: surface.doNot,
    output: surface.artifactPath,
    validator: `node scripts/ai-harness/validate-stateful-surface.mjs ${surface.surfaceId} --require=${gap.id}`,
    doneWhen: `evidenceGaps.${gap.id}.status is resolved, at least one concrete source/finding/proofLevel record exists, and the validator exits 0.`,
    next: "node scripts/ai-harness/next-stateful-task.mjs"
  };
}

function decisionTask(surface) {
  return {
    taskType: "DECISION",
    surfaceId: surface.surfaceId,
    status: "READY_FOR_DECISION",
    ownedPaths: [surface.artifactPath, ".ai/stateful-surface-ledger.json"],
    question: `Given the resolved evidence for ${surface.surfaceId}, should the canonical ledger remain KEEP or authorize exactly one bounded migration seam?`,
    doNow: `Read only ${surface.artifactPath} plus the matching canonical ledger entry. Update only that canonical ledger entry if the evidence supports a decision; KEEP is valid.`,
    doNot: [...surface.doNot, "Do not implement product/runtime migration in the decision step."],
    output: ".ai/stateful-surface-ledger.json",
    validator: "node scripts/ai-harness/validate-stateful-architecture.mjs",
    doneWhen: "The matching canonical ledger entry records an evidence-backed decision, the architecture validator exits 0, and no second non-keep seam is approved.",
    next: "node scripts/ai-harness/next-stateful-task.mjs"
  };
}

function printTask(task) {
  const lines = [
    "CURRENT SURFACE",
    task.surfaceId,
    "",
    ...(task.gapId ? ["CURRENT GAP", task.gapId, ""] : []),
    "STATUS",
    task.status,
    "",
    "OWNED PATHS",
    ...task.ownedPaths.map((item) => `- ${item}`),
    "",
    "QUESTION TO RESOLVE",
    task.question,
    "",
    "DO NOW",
    task.doNow,
    "",
    "DO NOT",
    ...task.doNot.map((item) => `- ${item}`),
    "",
    "OUTPUT",
    task.output,
    "",
    "VALIDATE",
    task.validator,
    "",
    "DONE WHEN",
    task.doneWhen,
    "",
    "NEXT",
    task.next
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function main() {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const root = path.resolve(rootArg ? rootArg.slice("--root=".length) : DEFAULT_ROOT);
  const jsonMode = process.argv.includes("--json");
  const surfaceOverride = process.argv.find((arg) => arg.startsWith("--surface="));
  if (surfaceOverride) {
    const output = { error: "manual surface override is forbidden; run next-stateful-task.mjs without --surface so priority and blockers cannot be bypassed" };
    if (jsonMode) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    else console.error(output.error);
    process.exitCode = 2;
    return;
  }

  const contract = readJson(root, CONTRACT_PATH);
  if (contract.selectionPolicy?.maxTasksReturned !== 1) {
    console.error("stateful execution contract must return exactly one task");
    process.exitCode = 1;
    return;
  }

  const priority = contract.selectionPolicy.surfacePriority;
  const surfaces = [];
  const validationErrors = [];
  for (const id of priority) {
    const result = validateSurface(root, id);
    if (result.errors.length) validationErrors.push(...result.errors);
    if (fs.existsSync(path.join(root, SURFACE_DIR, `${id}.json`))) surfaces.push(loadSurface(root, id).task);
  }
  if (validationErrors.length) {
    if (jsonMode) process.stdout.write(`${JSON.stringify({ errors: validationErrors }, null, 2)}\n`);
    else {
      console.error("[next-stateful-task] invalid surface artifacts");
      for (const error of validationErrors) console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  for (const surface of surfaces) {
    const gap = surface.evidenceGaps.find((item) => item.status === "open");
    if (gap) {
      const task = evidenceTask(surface, gap);
      if (jsonMode) process.stdout.write(`${JSON.stringify({ task }, null, 2)}\n`);
      else printTask(task);
      return;
    }
  }

  const blocked = surfaces.flatMap((surface) => surface.evidenceGaps.filter((gap) => gap.status === "blocked").map((gap) => ({ surfaceId: surface.surfaceId, gapId: gap.id, blocker: gap.blocker })));
  if (blocked.length) {
    const output = { status: "BLOCKED_STATEFUL_TASKS_REMAIN", blocked };
    if (jsonMode) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    else {
      console.error("BLOCKED_STATEFUL_TASKS_REMAIN");
      for (const item of blocked) console.error(`- ${item.surfaceId}:${item.gapId}: ${item.blocker}`);
    }
    process.exitCode = 2;
    return;
  }

  const ready = surfaces.find((surface) => surface.status === "READY_FOR_DECISION");
  if (ready) {
    const task = decisionTask(ready);
    if (jsonMode) process.stdout.write(`${JSON.stringify({ task }, null, 2)}\n`);
    else printTask(task);
    return;
  }

  const output = { status: "NO_STATEFUL_TASKS_REMAIN" };
  if (jsonMode) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  else process.stdout.write("NO_STATEFUL_TASKS_REMAIN\n");
}

main();
