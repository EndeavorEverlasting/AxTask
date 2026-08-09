#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSurface } from "./validate-stateful-surface.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTRACT = ".ai/stateful-execution-contract.json";
const SURFACE_DIR = ".ai/architecture/surfaces";
const readJson = (root, rel) => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));

function statusAfterResolving(surface, currentGap) {
  const remaining = surface.evidenceGaps.filter((gap) => gap.id !== currentGap.id);
  if (remaining.some((gap) => gap.status === "open")) return "EVIDENCE_REQUIRED";
  if (remaining.some((gap) => gap.status === "blocked")) return "BLOCKED";
  return "READY_FOR_DECISION";
}

function evidenceTask(surface, gap) {
  const nextStatus = statusAfterResolving(surface, gap);
  return {
    taskType: "EVIDENCE",
    surfaceId: surface.surfaceId,
    gapId: gap.id,
    status: "EVIDENCE_REQUIRED",
    ownedPaths: gap.exactFiles,
    question: gap.question,
    doNow: `Inspect only the exact files for ${surface.surfaceId}:${gap.id}. Update only evidenceGaps.${gap.id} in ${surface.artifactPath}; set the gap to resolved only with repository evidence, then set the artifact top-level status to ${nextStatus}.`,
    doNot: surface.doNot,
    output: surface.artifactPath,
    validator: `node scripts/ai-harness/validate-stateful-surface.mjs ${surface.surfaceId} --require=${gap.id}`,
    doneWhen: `The routed gap is resolved with concrete in-boundary evidence, top-level status is ${nextStatus}, and the validator exits 0.`,
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
    doNow: `Read only ${surface.artifactPath} plus the matching canonical ledger entry. Record the evidence-backed canonical decision, then set ${surface.artifactPath} status to COMPLETED. COMPLETED closes only this evidence/decision routing loop; it does not claim migration implementation or runtime proof.`,
    doNot: [...surface.doNot, "Do not implement product/runtime migration in the decision step."],
    output: `${surface.artifactPath} + .ai/stateful-surface-ledger.json`,
    validator: `node scripts/ai-harness/validate-stateful-architecture.mjs && node scripts/ai-harness/validate-stateful-surface.mjs ${surface.surfaceId}`,
    doneWhen: "The matching canonical ledger entry records an evidence-backed decision, the surface artifact status is COMPLETED, both validators exit 0, and no second non-keep seam is approved.",
    next: "node scripts/ai-harness/next-stateful-task.mjs"
  };
}

function printTask(task) {
  const parts = ["CURRENT SURFACE", task.surfaceId, "", ...(task.gapId ? ["CURRENT GAP", task.gapId, ""] : []), "STATUS", task.status, "", "OWNED PATHS", ...task.ownedPaths.map((p) => `- ${p}`), "", "QUESTION TO RESOLVE", task.question, "", "DO NOW", task.doNow, "", "DO NOT", ...task.doNot.map((p) => `- ${p}`), "", "OUTPUT", task.output, "", "VALIDATE", task.validator, "", "DONE WHEN", task.doneWhen, "", "NEXT", task.next];
  process.stdout.write(`${parts.join("\n")}\n`);
}

function main() {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const root = path.resolve(rootArg ? rootArg.slice(7) : ROOT);
  const json = process.argv.includes("--json");
  if (process.argv.some((arg) => arg.startsWith("--surface="))) {
    const out = { error: "manual surface override is forbidden; run next-stateful-task.mjs without --surface so priority and blockers cannot be bypassed" };
    if (json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`); else console.error(out.error);
    process.exitCode = 2; return;
  }

  const contract = readJson(root, CONTRACT);
  if (contract.selectionPolicy?.maxTasksReturned !== 1) { console.error("stateful execution contract must return exactly one task"); process.exitCode = 1; return; }

  const surfaces = [];
  const errors = [];
  for (const id of contract.selectionPolicy.surfacePriority) {
    const result = validateSurface(root, id);
    errors.push(...result.errors);
    const file = path.join(root, SURFACE_DIR, `${id}.json`);
    if (fs.existsSync(file)) surfaces.push(readJson(root, `${SURFACE_DIR}/${id}.json`));
  }
  if (errors.length) {
    if (json) process.stdout.write(`${JSON.stringify({ errors }, null, 2)}\n`); else { console.error("[next-stateful-task] invalid surface artifacts"); errors.forEach((e) => console.error(`- ${e}`)); }
    process.exitCode = 1; return;
  }

  for (const surface of surfaces) {
    if (surface.status === "COMPLETED") continue;
    const gap = surface.evidenceGaps.find((item) => item.status === "open");
    if (gap) { const task = evidenceTask(surface, gap); if (json) process.stdout.write(`${JSON.stringify({ task }, null, 2)}\n`); else printTask(task); return; }
    const blocked = surface.evidenceGaps.filter((gap) => gap.status === "blocked");
    if (blocked.length) {
      const out = { status: "BLOCKED_STATEFUL_TASK", blocked: blocked.map((gap) => ({ surfaceId: surface.surfaceId, gapId: gap.id, blocker: gap.blocker })) };
      if (json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`); else { console.error(out.status); out.blocked.forEach((b) => console.error(`- ${b.surfaceId}:${b.gapId}: ${b.blocker}`)); }
      process.exitCode = 2; return;
    }
    if (surface.status === "READY_FOR_DECISION") { const task = decisionTask(surface); if (json) process.stdout.write(`${JSON.stringify({ task }, null, 2)}\n`); else printTask(task); return; }
  }

  if (json) process.stdout.write(`${JSON.stringify({ status: "NO_STATEFUL_TASKS_REMAIN" }, null, 2)}\n`); else process.stdout.write("NO_STATEFUL_TASKS_REMAIN\n");
}

main();
