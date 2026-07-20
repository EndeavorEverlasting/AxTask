#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_SCHEMA_PATH = ".ai/runtime-proof.schema.json";

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

  if (proof.authorityRef !== schema.authorityRef) {
    errors.push(`${proofPath}: authorityRef must equal ${schema.authorityRef}`);
  }

  const required = new Set(array(schema.required));
  for (const field of required) {
    if (!(field in proof)) {
      errors.push(`${proofPath}: missing required field ${field}`);
    }
  }

  const envClass = proof.environmentClass;
  if (envClass && !array(schema.properties?.environmentClass?.enum).includes(envClass)) {
    errors.push(`${proofPath}: environmentClass must be one of ${array(schema.properties?.environmentClass?.enum).join(", ")}`);
  }

  const proofLevels = new Set(array(schema.properties?.attainedProofLevel?.enum));
  if (proof.attainedProofLevel && !proofLevels.has(proof.attainedProofLevel)) {
    errors.push(`${proofPath}: attainedProofLevel is not a valid proof level`);
  }
  if (proof.proofCeiling && !proofLevels.has(proof.proofCeiling)) {
    errors.push(`${proofPath}: proofCeiling is not a valid proof level`);
  }
  if (proof.attainedProofLevel && proof.proofCeiling && !levelAtMost(proof.attainedProofLevel, proof.proofCeiling)) {
    errors.push(`${proofPath}: attainedProofLevel ${proof.attainedProofLevel} exceeds proofCeiling ${proof.proofCeiling}`);
  }

  if (envClass === "local" && proof.attainedProofLevel) {
    const forbidden = array(schema.proofEscalationRules?.local?.forbiddenClaims);
    if (forbidden.includes(proof.attainedProofLevel)) {
      errors.push(`${proofPath}: local environmentClass cannot claim attainedProofLevel ${proof.attainedProofLevel}`);
    }
  }
  if (envClass === "staging" && proof.attainedProofLevel) {
    const forbidden = array(schema.proofEscalationRules?.staging?.forbiddenClaims);
    if (forbidden.includes(proof.attainedProofLevel)) {
      errors.push(`${proofPath}: staging environmentClass cannot claim attainedProofLevel ${proof.attainedProofLevel}`);
    }
  }
  if (envClass === "live" && proof.attainedProofLevel && ["live-runtime", "deployment-completion", "operator-acceptance"].includes(proof.attainedProofLevel)) {
    const required = new Set(array(schema.proofEscalationRules?.live?.requires));
    if (!nonEmptyString(proof.deploymentId)) errors.push(`${proofPath}: live attainedProofLevel requires deploymentId`);
    if (!nonEmptyString(proof.deploymentTimestamp)) errors.push(`${proofPath}: live attainedProofLevel requires deploymentTimestamp`);
    if (!array(proof.observedEndpoints).length && !nonEmptyString(proof.observedEndpoints)) errors.push(`${proofPath}: live attainedProofLevel requires observedEndpoints`);
  }

  if (proof.operatorAcceptance?.accepted === true) {
    if (!nonEmptyString(proof.operatorAcceptance.acceptedBy)) errors.push(`${proofPath}: operator acceptance requires acceptedBy`);
    if (!nonEmptyString(proof.operatorAcceptance.acceptedAt)) errors.push(`${proofPath}: operator acceptance requires acceptedAt`);
  }

  return { schemaId: schema.schemaId, errors };
}

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

function levelAtMost(level, ceiling) {
  const levelIndex = PROOF_ORDER.indexOf(level);
  const ceilingIndex = PROOF_ORDER.indexOf(ceiling);
  if (levelIndex === -1 || ceilingIndex === -1) return true;
  return levelIndex <= ceilingIndex;
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
