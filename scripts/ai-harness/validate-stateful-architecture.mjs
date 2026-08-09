#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

function readJson(root, rel, errors) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    errors.push(`missing JSON file: ${rel}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${rel}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function readText(root, rel, errors) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    errors.push(`missing text file: ${rel}`);
    return "";
  }
  return fs.readFileSync(file, "utf8");
}

function nonEmpty(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function ids(items) {
  return new Set(arr(items).map((item) => item?.id).filter(nonEmpty));
}

function jsonEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateAgainstSchema(value, schema, label, errors) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    errors.push(`${label}: invalid schema node`);
    return;
  }

  const type = schema.type;
  if (type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${label}: expected object`);
      return;
    }
    for (const required of arr(schema.required)) {
      if (!Object.prototype.hasOwnProperty.call(value, required)) {
        errors.push(`${label}: missing required property ${required}`);
      }
    }
    if (schema.properties && typeof schema.properties === "object") {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          validateAgainstSchema(value[key], childSchema, `${label}.${key}`, errors);
        }
      }
    }
  } else if (type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${label}: expected array`);
      return;
    }
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
      errors.push(`${label}: expected at least ${schema.minItems} item(s)`);
    }
    if (schema.items) {
      value.forEach((item, index) => validateAgainstSchema(item, schema.items, `${label}[${index}]`, errors));
    }
  } else if (type === "string") {
    if (typeof value !== "string") errors.push(`${label}: expected string`);
  } else if (type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${label}: expected finite number`);
  } else if (type === "integer") {
    if (!Number.isInteger(value)) errors.push(`${label}: expected integer`);
  } else if (type === "boolean") {
    if (typeof value !== "boolean") errors.push(`${label}: expected boolean`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.some((item) => jsonEqual(item, value))) {
    errors.push(`${label}: value is not in declared enum`);
  }
}

export function validateStatefulArchitecture(root = DEFAULT_ROOT) {
  const errors = [];
  const warnings = [];

  const ledger = readJson(root, ".ai/stateful-surface-ledger.json", errors);
  const ledgerSchema = readJson(root, ".ai/stateful-surface-ledger.schema.json", errors);
  const harness = readJson(root, ".ai/harness.json", errors);
  const workflows = readJson(root, ".ai/workflow-registry.json", errors);
  const capabilities = readJson(root, ".ai/capability-registry.json", errors);
  const triggers = readJson(root, ".ai/trigger-registry.json", errors);
  const artifacts = readJson(root, ".ai/artifact-registry.json", errors);
  const validators = readJson(root, ".ai/validator-registry.json", errors);

  const workflowText = readText(root, ".ai/workflows/stateful-architecture-migration.md", errors);
  const skillText = readText(root, ".ai/skills/stateful-architecture-migration.md", errors);
  const humanLedger = readText(root, "docs/architecture/STATEFUL_SURFACE_LEDGER.md", errors);
  const reportTemplate = readText(root, ".ai/reports/stateful-architecture-report-template.md", errors);

  if (ledger && ledgerSchema) {
    validateAgainstSchema(ledger, ledgerSchema, ".ai/stateful-surface-ledger.json", errors);
  }

  if (ledger) {
    if (ledger.ledgerId !== "axtask.stateful-surface-ledger.v1") errors.push(".ai/stateful-surface-ledger.json: ledgerId mismatch");
    if (!nonEmpty(ledger.mission)) errors.push(".ai/stateful-surface-ledger.json: mission is required");

    const policy = ledger.decisionPolicy ?? {};
    if (policy.defaultDisposition !== "keep") errors.push(".ai/stateful-surface-ledger.json: defaultDisposition must be keep");
    const migrationRule = String(policy.migrationAuthorizationRule ?? "");
    if (!/\bone\s+named\s+migrationSeam\b/i.test(migrationRule)) {
      errors.push("migrationAuthorizationRule must require one named migrationSeam");
    }
    if (!/\bprovisional\b/i.test(migrationRule) || !/\bKEEP\b/.test(migrationRule)) {
      errors.push("migrationAuthorizationRule must preserve provisional fail-closed KEEP semantics");
    }
    if (!String(policy.proofRule ?? "").includes("may not be promoted")) errors.push("decisionPolicy.proofRule must explicitly forbid proof promotion");

    const requiredSurfaceFields = [
      "id","name","category","owner","files","currentResponsibility","stateHeld","stateLifetime","persistenceMechanism","consumers","processAffinity","longLivedConnection","filesystemDependency","schedulingDependency","deploymentCoupling","invariants","stableContracts","evidence","disposition","decisionStatus","rationale","migrationSeam","prerequisites","forbiddenChanges","validators","proofCeiling","collisionPaths"
    ];
    const allowedDisposition = new Set(["keep","replace","externalize","delete"]);
    const allowedDecisionStatus = new Set(["provisional","approved"]);
    const seen = new Set();
    let approvedMigrationSeams = 0;

    if (arr(ledger.surfaces).length < 6) errors.push("stateful ledger must contain at least six primary surfaces");

    for (const surface of arr(ledger.surfaces)) {
      const label = `surface ${surface?.id ?? "unknown"}`;
      for (const field of requiredSurfaceFields) {
        const value = surface?.[field];
        if (Array.isArray(value) ? value.length === 0 : !nonEmpty(value)) errors.push(`${label}: ${field} is required`);
      }
      if (seen.has(surface?.id)) errors.push(`${label}: duplicate id`);
      seen.add(surface?.id);
      if (!allowedDisposition.has(surface?.disposition)) errors.push(`${label}: invalid disposition`);
      if (!allowedDecisionStatus.has(surface?.decisionStatus)) errors.push(`${label}: invalid decisionStatus`);
      if (surface?.decisionStatus === "provisional" && surface?.disposition !== "keep") errors.push(`${label}: provisional decisions must fail closed to keep`);
      if (surface?.decisionStatus === "approved" && surface?.disposition !== "keep") {
        approvedMigrationSeams += 1;
        if (arr(surface?.evidence).length < 2) errors.push(`${label}: approved migration decision requires at least two evidence items`);
        if (arr(surface?.validators).length < 2) errors.push(`${label}: approved migration decision requires at least two validators`);
        if (!nonEmpty(surface?.migrationSeam)) errors.push(`${label}: approved migration decision requires a bounded migrationSeam`);
      }
      if (arr(surface?.forbiddenChanges).length === 0) errors.push(`${label}: forbiddenChanges cannot be empty`);
      if (arr(surface?.stableContracts).length === 0) errors.push(`${label}: stableContracts cannot be empty`);
      if (arr(surface?.collisionPaths).some((item) => !nonEmpty(item))) errors.push(`${label}: collisionPaths must be non-empty strings`);
    }

    if (approvedMigrationSeams > 1) {
      errors.push(`stateful ledger authorizes ${approvedMigrationSeams} migration seams; at most one approved non-keep seam is allowed`);
    }

    for (const requiredId of ["http-process-runtime","postgres-domain-state","auth-session-state","scheduled-background-work","filesystem-artifacts","deployment-orchestration","integration-seams"]) {
      if (!seen.has(requiredId)) errors.push(`stateful ledger missing required surface ${requiredId}`);
    }
  }

  const componentIds = ids(harness?.components);
  for (const required of ["stateful-surface-ledger","stateful-architecture-workflow","stateful-architecture-skill","stateful-architecture-validator","stateful-architecture-report"]) {
    if (!componentIds.has(required)) errors.push(`.ai/harness.json missing component ${required}`);
  }
  if (!arr(harness?.skills).includes("axtask.skill.stateful-architecture-migration.v1")) errors.push(".ai/harness.json missing stateful architecture skill registration");
  if (!arr(harness?.hookPolicy?.preCommitRuns).includes("stateful-architecture")) errors.push(".ai/harness.json preCommitRuns must include stateful-architecture");
  if (!arr(harness?.hookPolicy?.prePushRuns).includes("stateful-architecture")) errors.push(".ai/harness.json prePushRuns must include stateful-architecture");

  if (!ids(workflows?.workflows).has("axtask.stateful-architecture-migration.v1")) errors.push(".ai/workflow-registry.json missing axtask.stateful-architecture-migration.v1");
  if (!ids(capabilities?.capabilities).has("stateful-architecture-ledger-validation")) errors.push(".ai/capability-registry.json missing stateful-architecture-ledger-validation");
  const trigger = arr(triggers?.triggers).find((item) => item?.id === "serverless-or-stateful-architecture-change");
  if (trigger?.workflowId !== "axtask.stateful-architecture-migration.v1") errors.push(".ai/trigger-registry.json must route serverless-or-stateful-architecture-change to the stateful architecture workflow");
  if (!ids(artifacts?.artifacts).has("stateful-surface-ledger")) errors.push(".ai/artifact-registry.json missing stateful-surface-ledger");
  if (!ids(artifacts?.artifacts).has("stateful-architecture-report")) errors.push(".ai/artifact-registry.json missing stateful-architecture-report");
  const validator = arr(validators?.validators).find((item) => item?.id === "stateful-architecture");
  if (validator?.command !== "node scripts/ai-harness/validate-stateful-architecture.mjs") errors.push(".ai/validator-registry.json stateful-architecture command mismatch");

  for (const heading of ["## Trigger","## Inputs","## Factoring rules","## Execution loop","## Parallel lanes","## Validation","## Outputs","## Proof ceiling"]) {
    if (!workflowText.includes(heading)) errors.push(`stateful architecture workflow missing ${heading}`);
  }
  for (const phrase of ["KEEP is a valid final decision","one migration seam per sprint","application logic remains in code and domain contracts","do not choose a serverless provider"]) {
    if (!workflowText.toLowerCase().includes(phrase.toLowerCase())) errors.push(`stateful architecture workflow missing guardrail: ${phrase}`);
  }
  for (const heading of ["## Use when","## Required inputs","## Procedure","## Guardrails","## Outputs","## Proof rules"]) {
    if (!skillText.includes(heading)) errors.push(`stateful architecture skill missing ${heading}`);
  }
  for (const phrase of ["Stateful does not mean bad","provisional","KEEP","one seam","serverless provider"]) {
    if (!humanLedger.toLowerCase().includes(phrase.toLowerCase())) errors.push(`human stateful ledger missing guardrail: ${phrase}`);
  }
  for (const heading of ["## CURRENT BASELINE","## LEDGER CHANGES","## OWNED SEAM","## VALIDATION","## PROOF","## RISKS","## NEXT ACTION"]) {
    if (!reportTemplate.includes(heading)) errors.push(`stateful architecture report template missing ${heading}`);
  }

  return { errors, warnings, surfacesChecked: arr(ledger?.surfaces).length };
}

function main() {
  const root = process.argv.find((arg) => arg.startsWith("--root="))?.slice("--root=".length) ?? DEFAULT_ROOT;
  const jsonMode = process.argv.includes("--json");
  const result = validateStatefulArchitecture(path.resolve(root));
  if (jsonMode) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.errors.length) {
    if (!jsonMode) {
      console.error(`[stateful-architecture] FAIL surfaces=${result.surfacesChecked}`);
      for (const error of result.errors) console.error(`- ${error}`);
    }
    process.exitCode = 1;
    return;
  }
  if (!jsonMode) console.log(`[stateful-architecture] PASS surfaces=${result.surfacesChecked}`);
}

main();
