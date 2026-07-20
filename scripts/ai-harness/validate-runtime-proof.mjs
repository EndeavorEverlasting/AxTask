#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_SCHEMA_PATH = ".ai/runtime-proof.schema.json";

const PROOF_ORDER = [
  "contract",
  "harness",
  "static-test",
  "build",
  "launcher",
  "command-ack",
  "behavior-observed",
  "local-runtime",
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

function levelIndex(level) {
  return PROOF_ORDER.indexOf(level);
}

function levelAtMost(level, ceiling) {
  const current = levelIndex(level);
  const maximum = levelIndex(ceiling);
  return current === -1 || maximum === -1 || current <= maximum;
}

function validateStringArray(proofPath, field, value, errors, { allowEmpty = true } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${proofPath}: ${field} must be an array`);
    return;
  }
  if (!allowEmpty && value.length === 0) errors.push(`${proofPath}: ${field} must not be empty`);
  if (value.some((item) => !nonEmptyString(item))) {
    errors.push(`${proofPath}: ${field} must contain only non-empty strings`);
  }
}

function validateAssertions(proofPath, assertions, errors) {
  if (!Array.isArray(assertions)) {
    errors.push(`${proofPath}: assertions must be an array`);
    return;
  }
  for (const [index, assertion] of assertions.entries()) {
    if (!assertion || typeof assertion !== "object" || Array.isArray(assertion)) {
      errors.push(`${proofPath}: assertions[${index}] must be an object`);
      continue;
    }
    if (!nonEmptyString(assertion.id)) errors.push(`${proofPath}: assertions[${index}].id must be a non-empty string`);
    if (!nonEmptyString(assertion.description)) errors.push(`${proofPath}: assertions[${index}].description must be a non-empty string`);
    if (typeof assertion.passed !== "boolean") errors.push(`${proofPath}: assertions[${index}].passed must be boolean`);
    if (!nonEmptyString(assertion.evidence)) errors.push(`${proofPath}: assertions[${index}].evidence must be a non-empty string`);
  }
}

function validateFailures(proofPath, failures, errors) {
  if (!Array.isArray(failures)) {
    errors.push(`${proofPath}: failures must be an array`);
    return;
  }
  for (const [index, failure] of failures.entries()) {
    if (!failure || typeof failure !== "object" || Array.isArray(failure)) {
      errors.push(`${proofPath}: failures[${index}] must be an object`);
      continue;
    }
    if (!nonEmptyString(failure.id)) errors.push(`${proofPath}: failures[${index}].id must be a non-empty string`);
    if (!nonEmptyString(failure.description)) errors.push(`${proofPath}: failures[${index}].description must be a non-empty string`);
    if (!nonEmptyString(failure.severity)) errors.push(`${proofPath}: failures[${index}].severity must be a non-empty string`);
  }
}

export function validateRuntimeProofFile(rootDir, proofPath) {
  const errors = [];
  const schema = readJson(rootDir, DEFAULT_SCHEMA_PATH, errors);
  if (!schema) return { schemaId: null, errors };

  const absoluteProofPath = path.resolve(proofPath);
  if (!fs.existsSync(absoluteProofPath)) {
    errors.push(`missing runtime-proof file: ${proofPath}`);
    return { schemaId: schema.schemaId, errors };
  }

  let proof;
  try {
    proof = JSON.parse(fs.readFileSync(absoluteProofPath, "utf8"));
  } catch (error) {
    errors.push(`${proofPath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return { schemaId: schema.schemaId, errors };
  }

  if (!proof || typeof proof !== "object" || Array.isArray(proof)) {
    errors.push(`${proofPath}: runtime proof must be a JSON object`);
    return { schemaId: schema.schemaId, errors };
  }
  if (proof.authorityRef !== schema.authorityRef) errors.push(`${proofPath}: authorityRef must equal ${schema.authorityRef}`);
  if (proof.schemaId !== schema.schemaId) errors.push(`${proofPath}: schemaId must equal ${schema.schemaId}`);

  for (const field of array(schema.required)) {
    if (!Object.prototype.hasOwnProperty.call(proof, field) || proof[field] === null || proof[field] === undefined) {
      errors.push(`${proofPath}: missing required field ${field}`);
    }
  }

  if (!nonEmptyString(proof.candidateSha)) errors.push(`${proofPath}: candidateSha must be a non-empty string`);
  const environmentClasses = array(schema.properties?.environmentClass?.enum);
  if (!environmentClasses.includes(proof.environmentClass)) {
    errors.push(`${proofPath}: environmentClass must be one of ${environmentClasses.join(", ")}`);
  }
  validateStringArray(proofPath, "commands", proof.commands, errors, { allowEmpty: false });
  validateStringArray(proofPath, "skippedEvidence", proof.skippedEvidence, errors);
  if (proof.sanitizedArtifacts !== undefined) validateStringArray(proofPath, "sanitizedArtifacts", proof.sanitizedArtifacts, errors);
  validateAssertions(proofPath, proof.assertions, errors);
  validateFailures(proofPath, proof.failures, errors);

  if (!proof.timestamps || typeof proof.timestamps !== "object" || Array.isArray(proof.timestamps)) {
    errors.push(`${proofPath}: timestamps must be an object`);
  } else {
    if (!nonEmptyString(proof.timestamps.startedAt)) errors.push(`${proofPath}: timestamps.startedAt must be a non-empty string`);
    if (!nonEmptyString(proof.timestamps.finishedAt)) errors.push(`${proofPath}: timestamps.finishedAt must be a non-empty string`);
  }

  const proofLevels = new Set(array(schema.properties?.attainedProofLevel?.enum));
  if (!proofLevels.has(proof.attainedProofLevel)) errors.push(`${proofPath}: attainedProofLevel is not a valid proof level`);
  if (!proofLevels.has(proof.proofCeiling)) errors.push(`${proofPath}: proofCeiling is not a valid proof level`);
  if (!levelAtMost(proof.attainedProofLevel, proof.proofCeiling)) {
    errors.push(`${proofPath}: attainedProofLevel ${proof.attainedProofLevel} exceeds proofCeiling ${proof.proofCeiling}`);
  }

  const environmentCeiling = proof.environmentClass === "local"
    ? "local-runtime"
    : proof.environmentClass === "staging"
      ? "live-runtime"
      : "operator-acceptance";
  if (levelIndex(proof.attainedProofLevel) > levelIndex(environmentCeiling)) {
    errors.push(`${proofPath}: ${proof.environmentClass} environmentClass cannot claim attainedProofLevel ${proof.attainedProofLevel}`);
  }
  if (levelIndex(proof.proofCeiling) > levelIndex(environmentCeiling)) {
    errors.push(`${proofPath}: ${proof.environmentClass} environmentClass cannot claim proofCeiling ${proof.proofCeiling}`);
  }

  if (proof.environmentClass === "live" && levelIndex(proof.attainedProofLevel) >= levelIndex("live-runtime")) {
    if (!nonEmptyString(proof.deploymentId)) errors.push(`${proofPath}: live attainedProofLevel requires deploymentId`);
    if (!nonEmptyString(proof.deploymentTimestamp)) errors.push(`${proofPath}: live attainedProofLevel requires deploymentTimestamp`);
    validateStringArray(proofPath, "observedEndpoints", proof.observedEndpoints, errors, { allowEmpty: false });
  }

  if (levelIndex(proof.attainedProofLevel) >= levelIndex("local-runtime")) {
    if (array(proof.assertions).some((assertion) => assertion?.passed !== true)) {
      errors.push(`${proofPath}: runtime proof levels require every assertion to pass`);
    }
    if (array(proof.failures).length > 0) errors.push(`${proofPath}: runtime proof levels cannot contain unresolved failures`);
  }

  if (!proof.operatorAcceptance || typeof proof.operatorAcceptance !== "object" || Array.isArray(proof.operatorAcceptance)) {
    errors.push(`${proofPath}: operatorAcceptance must be an object`);
  } else {
    if (typeof proof.operatorAcceptance.accepted !== "boolean") errors.push(`${proofPath}: operatorAcceptance.accepted must be boolean`);
    if (proof.operatorAcceptance.accepted === true) {
      if (!nonEmptyString(proof.operatorAcceptance.acceptedBy)) errors.push(`${proofPath}: operator acceptance requires acceptedBy`);
      if (!nonEmptyString(proof.operatorAcceptance.acceptedAt)) errors.push(`${proofPath}: operator acceptance requires acceptedAt`);
      if (proof.attainedProofLevel !== "operator-acceptance") errors.push(`${proofPath}: accepted operatorAcceptance requires attainedProofLevel operator-acceptance`);
    }
    if (proof.attainedProofLevel === "operator-acceptance" && proof.operatorAcceptance.accepted !== true) {
      errors.push(`${proofPath}: attainedProofLevel operator-acceptance requires accepted operatorAcceptance`);
    }
  }

  return { schemaId: schema.schemaId, errors };
}

function main() {
  const rootDir = DEFAULT_REPO_ROOT;
  const proofPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(rootDir, ".ai", "runs", "p07-sample", "runtime-proof.json");
  const result = validateRuntimeProofFile(rootDir, proofPath);
  if (result.errors.length > 0) {
    console.error(`[runtime-proof] FAIL schema=${result.schemaId ?? "unknown"}`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[runtime-proof] PASS schema=${result.schemaId}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
