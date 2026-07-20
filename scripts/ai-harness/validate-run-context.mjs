#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_SCHEMA_PATH = ".ai/run-context.schema.json";

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

export function validateRunContextFile(rootDir, contextPath) {
  const errors = [];
  const schema = readJson(rootDir, DEFAULT_SCHEMA_PATH, errors);
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

  if (context.authorityRef !== schema.authorityRef) {
    errors.push(`${contextPath}: authorityRef must equal ${schema.authorityRef}`);
  }

  const required = new Set(array(schema.required));
  for (const field of required) {
    if (!(field in context)) {
      errors.push(`${contextPath}: missing required field ${field}`);
    }
  }

  for (const field of array(schema.required)) {
    if (field in context && Array.isArray(schema.properties?.[field]?.items)) {
      const value = context[field];
      if (!Array.isArray(value)) {
        errors.push(`${contextPath}: ${field} must be an array`);
      } else if (value.some((item) => typeof item !== "string")) {
        errors.push(`${contextPath}: ${field} must contain only strings`);
      }
    }
  }

  if (schema.runtimePolicy) {
    if (context.tracked === true) errors.push(`${contextPath}: runtimePolicy.tracked must be false`);
    if (context.secretsAllowed === true) errors.push(`${contextPath}: secretsAllowed must be false`);
    if (context.rawLogsAllowed === true) errors.push(`${contextPath}: rawLogsAllowed must be false`);
  }

  const envClass = schema.properties?.environmentClass?.enum;
  if (envClass && context.environmentClass && !envClass.includes(context.environmentClass)) {
    errors.push(`${contextPath}: environmentClass must be one of ${envClass.join(", ")}`);
  }

  if (nonEmptyString(context.proofCeiling) && nonEmptyString(context.environmentClass)) {
    if (context.environmentClass === "local" && ["live-runtime", "deployment-completion", "operator-acceptance"].includes(context.proofCeiling)) {
      errors.push(`${contextPath}: local environmentClass cannot claim proofCeiling ${context.proofCeiling}`);
    }
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
