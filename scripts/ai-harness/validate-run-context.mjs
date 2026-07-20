#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_SCHEMA_PATH = ".ai/run-context.schema.json";

const PROOF_ORDER = [
  "contract",
  "harness",
  "static-test",
  "build",
  "launcher",
  "command-ack",
  "behavior-observed",
  "local-runtime",
  "staging-runtime",
  "live-runtime",
  "deployment-completion",
  "operator-acceptance",
];

function readJson(rootDir, relativePath, errors) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`missing JSON file: ${relativePath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    errors.push(`${relativePath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function ids(items) {
  return new Set(array(items).map((item) => item?.id).filter(nonEmptyString));
}

function proofIndex(level) {
  return PROOF_ORDER.indexOf(level);
}

function validateFieldType(contextPath, field, value, definition, errors) {
  if (!definition) return;
  if (definition.type === "string") {
    if (!nonEmptyString(value)) errors.push(`${contextPath}: ${field} must be a non-empty string`);
    if (array(definition.enum).length > 0 && nonEmptyString(value) && !definition.enum.includes(value)) {
      errors.push(`${contextPath}: ${field} must be one of ${definition.enum.join(", ")}`);
    }
    return;
  }
  if (definition.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${contextPath}: ${field} must be an array`);
      return;
    }
    const itemType = typeof definition.items === "string" ? definition.items : definition.items?.type;
    if (itemType === "string" && value.some((item) => !nonEmptyString(item))) {
      errors.push(`${contextPath}: ${field} must contain only non-empty strings`);
    }
  }
}

export function validateRunContextFile(rootDir, contextPath) {
  const errors = [];
  const schema = readJson(rootDir, DEFAULT_SCHEMA_PATH, errors);
  const workflowRegistry = readJson(rootDir, ".ai/workflow-registry.json", errors);
  const capabilityRegistry = readJson(rootDir, ".ai/capability-registry.json", errors);
  const triggerRegistry = readJson(rootDir, ".ai/trigger-registry.json", errors);
  const validatorRegistry = readJson(rootDir, ".ai/validator-registry.json", errors);
  const harness = readJson(rootDir, ".ai/harness.json", errors);
  if (!schema) return { schemaId: null, errors };

  const absoluteContextPath = path.resolve(contextPath);
  if (!fs.existsSync(absoluteContextPath)) {
    errors.push(`missing run-context file: ${contextPath}`);
    return { schemaId: schema.schemaId, errors };
  }

  let context;
  try {
    context = JSON.parse(fs.readFileSync(absoluteContextPath, "utf8"));
  } catch (error) {
    errors.push(`${contextPath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return { schemaId: schema.schemaId, errors };
  }

  if (!context || typeof context !== "object" || Array.isArray(context)) {
    errors.push(`${contextPath}: run context must be a JSON object`);
    return { schemaId: schema.schemaId, errors };
  }
  if (context.authorityRef !== schema.authorityRef) {
    errors.push(`${contextPath}: authorityRef must equal ${schema.authorityRef}`);
  }
  if (context.schemaId !== schema.schemaId) {
    errors.push(`${contextPath}: schemaId must equal ${schema.schemaId}`);
  }

  for (const field of array(schema.required)) {
    if (!Object.prototype.hasOwnProperty.call(context, field) || context[field] === null || context[field] === undefined) {
      errors.push(`${contextPath}: missing required field ${field}`);
      continue;
    }
    validateFieldType(contextPath, field, context[field], schema.properties?.[field], errors);
  }

  if (context.tracked === true) errors.push(`${contextPath}: runtime output must not be tracked`);
  if (context.secretsAllowed === true) errors.push(`${contextPath}: secretsAllowed must be false`);
  if (context.rawLogsAllowed === true) errors.push(`${contextPath}: rawLogsAllowed must be false`);

  const workflowIds = ids(workflowRegistry?.workflows);
  const capabilityIds = ids(capabilityRegistry?.capabilities);
  const triggerIds = ids(triggerRegistry?.triggers);
  const validatorIds = ids(validatorRegistry?.validators);
  const skillIds = new Set(array(harness?.skills).filter(nonEmptyString));

  if (nonEmptyString(context.workflowId) && !workflowIds.has(context.workflowId)) {
    errors.push(`${contextPath}: workflowId references unknown workflow ${context.workflowId}`);
  }
  for (const skillId of array(context.selectedSkills)) {
    if (!skillIds.has(skillId)) errors.push(`${contextPath}: selectedSkills references unknown skill ${skillId}`);
  }
  for (const capabilityId of array(context.selectedCapabilities)) {
    if (!capabilityIds.has(capabilityId)) errors.push(`${contextPath}: selectedCapabilities references unknown capability ${capabilityId}`);
  }
  for (const triggerId of array(context.selectedTriggers)) {
    if (!triggerIds.has(triggerId)) errors.push(`${contextPath}: selectedTriggers references unknown trigger ${triggerId}`);
  }
  for (const validatorId of array(context.targetedValidators)) {
    if (!validatorIds.has(validatorId)) errors.push(`${contextPath}: targetedValidators references unknown validator ${validatorId}`);
  }

  if (nonEmptyString(context.proofCeiling) && proofIndex(context.proofCeiling) === -1) {
    errors.push(`${contextPath}: proofCeiling is not a valid proof level`);
  }
  for (const field of ["requiredProofLevels", "attainedProofLevels"]) {
    for (const level of array(context[field])) {
      if (proofIndex(level) === -1) errors.push(`${contextPath}: ${field} contains invalid proof level ${level}`);
      if (proofIndex(context.proofCeiling) >= 0 && proofIndex(level) > proofIndex(context.proofCeiling)) {
        errors.push(`${contextPath}: ${field} level ${level} exceeds proofCeiling ${context.proofCeiling}`);
      }
    }
  }

  if (context.environmentClass === "local" && proofIndex(context.proofCeiling) > proofIndex("local-runtime")) {
    errors.push(`${contextPath}: local environmentClass cannot claim proofCeiling ${context.proofCeiling}`);
  }
  if (context.environmentClass === "staging" && proofIndex(context.proofCeiling) > proofIndex("staging-runtime")) {
    errors.push(`${contextPath}: staging environmentClass cannot claim proofCeiling ${context.proofCeiling}`);
  }

  return { schemaId: schema.schemaId, errors };
}

function main() {
  const rootDir = DEFAULT_REPO_ROOT;
  const contextPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, ".ai", "runs", "p07-sample", "context.json");
  const result = validateRunContextFile(rootDir, contextPath);
  if (result.errors.length > 0) {
    console.error(`[run-context] FAIL schema=${result.schemaId ?? "unknown"}`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[run-context] PASS schema=${result.schemaId}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
