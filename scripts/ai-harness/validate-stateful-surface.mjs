#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_FILE), "..", "..");
const SURFACE_DIR = ".ai/architecture/surfaces";
const SCHEMA = ".ai/stateful-surface-task.schema.json";
const PLACEHOLDER = /\b(todo|tbd|unknown|placeholder|later|to be determined)\b/i;
const SURFACE_STATUSES = new Set(["EVIDENCE_REQUIRED", "READY_FOR_DECISION", "BLOCKED", "COMPLETED"]);
const GAP_STATUSES = new Set(["open", "resolved", "blocked"]);
const PROOF_ORDER = ["contract", "harness", "static-test", "build", "launcher", "command-ack", "behavior-observed", "local-runtime", "live-runtime"];
const PROOF_RANK = new Map(PROOF_ORDER.map((level, index) => [level, index]));

const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
const normalize = (v) => String(v).replaceAll("\\", "/").replace(/^\.\//, "");

function readJson(file, errors) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { errors.push(`${path.relative(process.cwd(), file)}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`); return null; }
}

function validateDeclaredShape(task, schema, label, errors) {
  for (const key of Array.isArray(schema?.required) ? schema.required : []) {
    if (!Object.prototype.hasOwnProperty.call(task, key)) errors.push(`${label}: missing required property ${key}`);
  }
  if (schema?.additionalProperties === false && schema?.properties) {
    for (const key of Object.keys(task)) if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) errors.push(`${label}: unexpected property ${key}`);
  }
}

function expectedStatus(gaps) {
  if (gaps.some((gap) => gap.status === "open")) return "EVIDENCE_REQUIRED";
  if (gaps.some((gap) => gap.status === "blocked")) return "BLOCKED";
  return "READY_FOR_DECISION";
}

export function validateSurface(root, surfaceId, requiredGapId = null) {
  const errors = [];
  const rel = `${SURFACE_DIR}/${surfaceId}.json`;
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return { errors: [`missing stateful surface artifact: ${rel}`], surfaceId, gapsChecked: 0 };
  const task = readJson(file, errors);
  const schemaFile = path.join(root, SCHEMA);
  if (!fs.existsSync(schemaFile)) errors.push(`missing stateful surface task schema: ${SCHEMA}`);
  const schema = fs.existsSync(schemaFile) ? readJson(schemaFile, errors) : null;
  if (!task) return { errors, surfaceId, gapsChecked: 0 };
  if (schema) validateDeclaredShape(task, schema, rel, errors);

  if (task.schemaVersion !== 1) errors.push(`${rel}: schemaVersion must be 1`);
  if (task.authorityRef !== "axtask.agent-authority.v1") errors.push(`${rel}: authorityRef mismatch`);
  if (task.surfaceId !== surfaceId) errors.push(`${rel}: surfaceId must match filename`);
  if (!Number.isInteger(task.priority) || task.priority < 0) errors.push(`${rel}: priority must be a non-negative integer`);
  if (!SURFACE_STATUSES.has(task.status)) errors.push(`${rel}: invalid status ${task.status}`);
  if (!Array.isArray(task.ownedPaths) || !task.ownedPaths.length || task.ownedPaths.some((v) => !nonEmpty(v))) errors.push(`${rel}: ownedPaths must contain non-empty paths`);
  if (!Array.isArray(task.doNot) || !task.doNot.length || task.doNot.some((v) => !nonEmpty(v))) errors.push(`${rel}: doNot must contain explicit prohibitions`);
  if (task.artifactPath !== rel) errors.push(`${rel}: artifactPath must be ${rel}`);
  if (!PROOF_RANK.has(task.proofCeiling)) errors.push(`${rel}: invalid proofCeiling`);
  if (task.validator !== `node scripts/ai-harness/validate-stateful-surface.mjs ${surfaceId}`) errors.push(`${rel}: validator command mismatch`);
  if (task.nextCommand !== "node scripts/ai-harness/next-stateful-task.mjs") errors.push(`${rel}: nextCommand must route back through next-stateful-task.mjs`);

  const gaps = Array.isArray(task.evidenceGaps) ? task.evidenceGaps : [];
  if (!gaps.length) errors.push(`${rel}: evidenceGaps must contain at least one bounded question`);
  const seen = new Set();
  for (const gap of gaps) {
    const label = `${surfaceId}:${gap?.id ?? "missing-gap-id"}`;
    if (!nonEmpty(gap?.id)) errors.push(`${label}: id is required`);
    if (seen.has(gap?.id)) errors.push(`${label}: duplicate gap id`);
    seen.add(gap?.id);
    if (!nonEmpty(gap?.question)) errors.push(`${label}: question is required`);
    if (!GAP_STATUSES.has(gap?.status)) errors.push(`${label}: invalid status`);
    if (!Array.isArray(gap?.exactFiles) || !gap.exactFiles.length || gap.exactFiles.some((v) => !nonEmpty(v))) errors.push(`${label}: exactFiles must contain concrete files`);
    const exact = new Set();
    for (const raw of Array.isArray(gap?.exactFiles) ? gap.exactFiles : []) {
      const filePath = normalize(raw); exact.add(filePath);
      if (filePath.includes("*") || filePath.includes("<")) errors.push(`${label}: exactFiles may not contain globs/placeholders: ${raw}`);
      else if (!fs.existsSync(path.join(root, filePath))) errors.push(`${label}: exact file does not exist: ${raw}`);
    }

    const evidence = Array.isArray(gap?.evidence) ? gap.evidence : [];
    if (gap?.status === "resolved") {
      if (!evidence.length) errors.push(`${label}: resolved gap requires evidence`);
      for (const item of evidence) {
        const source = normalize(item?.source ?? "");
        if (!nonEmpty(item?.source) || PLACEHOLDER.test(String(item?.source ?? ""))) errors.push(`${label}: evidence source must be concrete`);
        else if (!exact.has(source)) errors.push(`${label}: evidence source must be one of the current gap exactFiles: ${item.source}`);
        else if (!fs.existsSync(path.join(root, source))) errors.push(`${label}: evidence source does not exist: ${item.source}`);
        if (!nonEmpty(item?.finding) || PLACEHOLDER.test(String(item?.finding ?? ""))) errors.push(`${label}: evidence finding must be concrete and placeholder-free`);
        if (!PROOF_RANK.has(item?.proofLevel)) errors.push(`${label}: evidence proofLevel is invalid`);
        else if (PROOF_RANK.has(task.proofCeiling) && PROOF_RANK.get(item.proofLevel) > PROOF_RANK.get(task.proofCeiling)) errors.push(`${label}: evidence proofLevel ${item.proofLevel} exceeds surface proof ceiling ${task.proofCeiling}`);
      }
      if (gap?.blocker !== null) errors.push(`${label}: resolved gap must clear blocker`);
    }
    if (gap?.status === "blocked" && (!nonEmpty(gap?.blocker) || PLACEHOLDER.test(gap.blocker))) errors.push(`${label}: blocked gap requires an exact blocker`);
    if (gap?.status === "open" && gap?.blocker !== null) errors.push(`${label}: open gap must not carry a blocker`);
  }

  const computed = expectedStatus(gaps);
  if (task.status !== "COMPLETED" && task.status !== computed) errors.push(`${rel}: status ${task.status} does not match evidence gaps; expected ${computed}`);
  if (task.status === "COMPLETED" && gaps.some((gap) => gap.status !== "resolved")) errors.push(`${rel}: COMPLETED requires every evidence gap resolved`);
  if (requiredGapId) {
    const gap = gaps.find((item) => item.id === requiredGapId);
    if (!gap) errors.push(`${rel}: required gap not found: ${requiredGapId}`);
    else if (gap.status !== "resolved") errors.push(`${surfaceId}:${requiredGapId}: current routed gap is not resolved`);
  }
  return { errors, surfaceId, gapsChecked: gaps.length };
}

export function listSurfaceIds(root = ROOT) {
  const dir = path.join(root, SURFACE_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)).sort();
}

function main() {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const root = path.resolve(rootArg ? rootArg.slice(7) : ROOT);
  const json = process.argv.includes("--json");
  const all = process.argv.includes("--all");
  const requireArg = process.argv.find((arg) => arg.startsWith("--require="));
  const requiredGap = requireArg ? requireArg.slice(10) : null;
  const surface = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const ids = all ? listSurfaceIds(root) : surface ? [surface] : [];
  if (!ids.length) { console.error("usage: validate-stateful-surface.mjs <surface-id> [--require=<gap-id>] [--json] | --all [--json]"); process.exitCode = 2; return; }
  const results = ids.map((id) => validateSurface(root, id, all ? null : requiredGap));
  const errors = results.flatMap((r) => r.errors);
  const out = { errors, surfacesChecked: results.length, gapsChecked: results.reduce((n, r) => n + r.gapsChecked, 0) };
  if (json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  if (errors.length) { if (!json) { console.error(`[stateful-surface] FAIL surfaces=${out.surfacesChecked} gaps=${out.gapsChecked}`); errors.forEach((e) => console.error(`- ${e}`)); } process.exitCode = 1; return; }
  if (!json) console.log(`[stateful-surface] PASS surfaces=${out.surfacesChecked} gaps=${out.gapsChecked}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_FILE)) main();
