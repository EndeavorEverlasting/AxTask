#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_FILE = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_FILE);
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const SURFACE_DIR = ".ai/architecture/surfaces";
const TASK_SCHEMA = ".ai/stateful-surface-task.schema.json";
const PLACEHOLDER = /\b(todo|tbd|unknown|placeholder|later|to be determined)\b/i;
const SURFACE_STATUSES = new Set(["EVIDENCE_REQUIRED", "READY_FOR_DECISION", "BLOCKED", "COMPLETED"]);
const GAP_STATUSES = new Set(["open", "resolved", "blocked"]);
const PROOF_LEVELS = new Set(["contract", "harness", "static-test", "build", "launcher", "command-ack", "behavior-observed", "local-runtime", "live-runtime"]);

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function readJson(file, errors) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(process.cwd(), file)}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function typeMatches(value, type) {
  if (type === "null") return value === null;
  if (type === "array") return Array.isArray(value);
  if (type === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  if (type === "integer") return Number.isInteger(value);
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  return typeof value === type;
}

function validateAgainstSchema(value, schema, label, errors) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    errors.push(`${label}: invalid schema node`);
    return;
  }

  if (Object.prototype.hasOwnProperty.call(schema, "const") && !jsonEqual(value, schema.const)) {
    errors.push(`${label}: value does not match declared const`);
  }
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonEqual(item, value))) {
    errors.push(`${label}: value is not in declared enum`);
  }

  const declaredTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (declaredTypes.length && !declaredTypes.some((type) => typeMatches(value, type))) {
    errors.push(`${label}: expected ${declaredTypes.join(" or ")}`);
    return;
  }
  if (value === null) return;

  const isObject = value !== null && typeof value === "object" && !Array.isArray(value);
  if (isObject && (declaredTypes.includes("object") || schema.properties || schema.required)) {
    const properties = schema.properties && typeof schema.properties === "object" ? schema.properties : {};
    for (const required of Array.isArray(schema.required) ? schema.required : []) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) errors.push(`${label}: missing required property ${required}`);
    }
    for (const [key, childSchema] of Object.entries(properties)) {
      if (Object.prototype.hasOwnProperty.call(value, key)) validateAgainstSchema(value[key], childSchema, `${label}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.prototype.hasOwnProperty.call(properties, key)) errors.push(`${label}: unexpected property ${key}`);
    }
  }

  if (Array.isArray(value) && (declaredTypes.includes("array") || schema.items)) {
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) errors.push(`${label}: expected at least ${schema.minItems} item(s)`);
    if (schema.items) value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${label}[${index}]`, errors));
  }

  if (typeof value === "string") {
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength) errors.push(`${label}: shorter than minLength ${schema.minLength}`);
    if (typeof schema.pattern === "string" && !(new RegExp(schema.pattern).test(value))) errors.push(`${label}: does not match declared pattern`);
  }
  if (typeof value === "number" && typeof schema.minimum === "number" && value < schema.minimum) errors.push(`${label}: below minimum ${schema.minimum}`);
}

function expectedSurfaceStatus(gaps) {
  if (gaps.some((gap) => gap.status === "open")) return "EVIDENCE_REQUIRED";
  if (gaps.some((gap) => gap.status === "blocked")) return "BLOCKED";
  return "READY_FOR_DECISION";
}

function normalizeRepoPath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "");
}

export function validateSurface(root, surfaceId, requiredGapId = null) {
  const errors = [];
  const rel = `${SURFACE_DIR}/${surfaceId}.json`;
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) return { errors: [`missing stateful surface artifact: ${rel}`], surfaceId, gapsChecked: 0 };
  const task = readJson(file, errors);
  const schemaFile = path.join(root, TASK_SCHEMA);
  if (!fs.existsSync(schemaFile)) errors.push(`missing stateful surface task schema: ${TASK_SCHEMA}`);
  const schema = fs.existsSync(schemaFile) ? readJson(schemaFile, errors) : null;
  if (!task) return { errors, surfaceId, gapsChecked: 0 };
  if (schema) validateAgainstSchema(task, schema, rel, errors);

  if (task.schemaVersion !== 1) errors.push(`${rel}: schemaVersion must be 1`);
  if (task.authorityRef !== "axtask.agent-authority.v1") errors.push(`${rel}: authorityRef mismatch`);
  if (task.surfaceId !== surfaceId) errors.push(`${rel}: surfaceId must match filename`);
  if (!Number.isInteger(task.priority) || task.priority < 0) errors.push(`${rel}: priority must be a non-negative integer`);
  if (!SURFACE_STATUSES.has(task.status)) errors.push(`${rel}: invalid status ${task.status}`);
  if (!Array.isArray(task.ownedPaths) || task.ownedPaths.length === 0 || task.ownedPaths.some((item) => !nonEmpty(item))) errors.push(`${rel}: ownedPaths must contain non-empty paths`);
  if (!Array.isArray(task.doNot) || task.doNot.length === 0 || task.doNot.some((item) => !nonEmpty(item))) errors.push(`${rel}: doNot must contain explicit prohibitions`);
  if (task.artifactPath !== rel) errors.push(`${rel}: artifactPath must be ${rel}`);
  if (!PROOF_LEVELS.has(task.proofCeiling)) errors.push(`${rel}: invalid proofCeiling`);
  if (task.validator !== `node scripts/ai-harness/validate-stateful-surface.mjs ${surfaceId}`) errors.push(`${rel}: validator command mismatch`);
  if (task.nextCommand !== "node scripts/ai-harness/next-stateful-task.mjs") errors.push(`${rel}: nextCommand must route back through next-stateful-task.mjs`);

  const gaps = Array.isArray(task.evidenceGaps) ? task.evidenceGaps : [];
  if (gaps.length === 0) errors.push(`${rel}: evidenceGaps must contain at least one bounded question`);
  const seen = new Set();
  for (const gap of gaps) {
    const label = `${surfaceId}:${gap?.id ?? "missing-gap-id"}`;
    if (!nonEmpty(gap?.id)) errors.push(`${label}: id is required`);
    if (seen.has(gap?.id)) errors.push(`${label}: duplicate gap id`);
    seen.add(gap?.id);
    if (!nonEmpty(gap?.question)) errors.push(`${label}: question is required`);
    if (!GAP_STATUSES.has(gap?.status)) errors.push(`${label}: invalid status`);
    if (!Array.isArray(gap?.exactFiles) || gap.exactFiles.length === 0 || gap.exactFiles.some((item) => !nonEmpty(item))) errors.push(`${label}: exactFiles must contain concrete files`);
    const exactFileSet = new Set();
    for (const exactFile of Array.isArray(gap?.exactFiles) ? gap.exactFiles : []) {
      const normalized = normalizeRepoPath(exactFile);
      exactFileSet.add(normalized);
      if (normalized.includes("*") || normalized.includes("<")) errors.push(`${label}: exactFiles may not contain globs/placeholders: ${exactFile}`);
      else if (!fs.existsSync(path.join(root, normalized))) errors.push(`${label}: exact file does not exist: ${exactFile}`);
    }
    const evidence = Array.isArray(gap?.evidence) ? gap.evidence : [];
    if (gap?.status === "resolved") {
      if (evidence.length === 0) errors.push(`${label}: resolved gap requires evidence`);
      for (const item of evidence) {
        if (!nonEmpty(item?.source) || PLACEHOLDER.test(String(item?.source ?? ""))) {
          errors.push(`${label}: evidence source must be concrete`);
        } else {
          const source = normalizeRepoPath(item.source);
          if (!exactFileSet.has(source)) errors.push(`${label}: evidence source must be one of the current gap exactFiles: ${item.source}`);
          else if (!fs.existsSync(path.join(root, source))) errors.push(`${label}: evidence source does not exist: ${item.source}`);
        }
        if (!nonEmpty(item?.finding) || PLACEHOLDER.test(String(item?.finding ?? ""))) errors.push(`${label}: evidence finding must be concrete and placeholder-free`);
        if (!PROOF_LEVELS.has(item?.proofLevel)) errors.push(`${label}: evidence proofLevel is invalid`);
      }
      if (gap?.blocker !== null) errors.push(`${label}: resolved gap must clear blocker`);
    }
    if (gap?.status === "blocked" && (!nonEmpty(gap?.blocker) || PLACEHOLDER.test(gap.blocker))) errors.push(`${label}: blocked gap requires an exact blocker`);
    if (gap?.status === "open" && gap?.blocker !== null) errors.push(`${label}: open gap must not carry a blocker`);
  }

  const computed = expectedSurfaceStatus(gaps);
  if (task.status !== "COMPLETED" && task.status !== computed) errors.push(`${rel}: status ${task.status} does not match evidence gaps; expected ${computed}`);
  if (task.status === "COMPLETED" && gaps.some((gap) => gap.status !== "resolved")) errors.push(`${rel}: COMPLETED requires every evidence gap resolved`);

  if (requiredGapId) {
    const gap = gaps.find((item) => item.id === requiredGapId);
    if (!gap) errors.push(`${rel}: required gap not found: ${requiredGapId}`);
    else if (gap.status !== "resolved") errors.push(`${surfaceId}:${requiredGapId}: current routed gap is not resolved`);
  }

  return { errors, surfaceId, gapsChecked: gaps.length };
}

export function listSurfaceIds(root = DEFAULT_ROOT) {
  const dir = path.join(root, SURFACE_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -5)).sort();
}

function main() {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const root = path.resolve(rootArg ? rootArg.slice("--root=".length) : DEFAULT_ROOT);
  const jsonMode = process.argv.includes("--json");
  const all = process.argv.includes("--all");
  const requireArg = process.argv.find((arg) => arg.startsWith("--require="));
  const requiredGapId = requireArg ? requireArg.slice("--require=".length) : null;
  const surfaceId = process.argv.slice(2).find((arg) => !arg.startsWith("--"));

  const ids = all ? listSurfaceIds(root) : surfaceId ? [surfaceId] : [];
  if (ids.length === 0) {
    console.error("usage: validate-stateful-surface.mjs <surface-id> [--require=<gap-id>] [--json] | --all [--json]");
    process.exitCode = 2;
    return;
  }

  const results = ids.map((id) => validateSurface(root, id, all ? null : requiredGapId));
  const errors = results.flatMap((result) => result.errors);
  const output = { errors, surfacesChecked: results.length, gapsChecked: results.reduce((sum, result) => sum + result.gapsChecked, 0) };
  if (jsonMode) process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (errors.length) {
    if (!jsonMode) {
      console.error(`[stateful-surface] FAIL surfaces=${output.surfacesChecked} gaps=${output.gapsChecked}`);
      for (const error of errors) console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  if (!jsonMode) console.log(`[stateful-surface] PASS surfaces=${output.surfacesChecked} gaps=${output.gapsChecked}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(SCRIPT_FILE)) main();
