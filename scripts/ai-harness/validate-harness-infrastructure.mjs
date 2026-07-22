#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateHarnessContract } from "./validate-harness.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

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

function readText(rootDir, relativePath, errors) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`missing text file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function ids(items) {
  return new Set(array(items).map((item) => item?.id).filter(nonEmpty));
}

function requireText(label, item, fields, errors) {
  for (const field of fields) {
    if (!nonEmpty(item?.[field])) errors.push(`${label} ${item?.id ?? "unknown"} requires ${field}`);
  }
}

export function validateHarnessInfrastructure(rootDir = DEFAULT_REPO_ROOT) {
  const base = validateHarnessContract(rootDir);
  const errors = [...base.errors];
  const warnings = [...base.warnings];

  const harness = readJson(rootDir, ".ai/harness.json", errors);
  const map = readJson(rootDir, ".ai/codebase-map.json", errors);
  const artifacts = readJson(rootDir, ".ai/artifact-registry.json", errors);
  const validators = readJson(rootDir, ".ai/validator-registry.json", errors);
  const workflows = readJson(rootDir, ".ai/workflow-registry.json", errors);
  const triggers = readJson(rootDir, ".ai/trigger-registry.json", errors);

  if (!harness) return { ...base, errors, warnings };

  if (map) {
    const commandIds = ids(map.commands);
    for (const required of ["install", "development", "typecheck", "test", "build", "deploy-contract", "production-start"]) {
      if (!commandIds.has(required)) errors.push(`.ai/codebase-map.json: missing command ${required}`);
    }
    for (const command of array(map.commands)) requireText("codebase command", command, ["command", "role", "mutation"], errors);
    for (const config of array(map.configurations)) {
      requireText("configuration", config, ["path", "role"], errors);
      if (nonEmpty(config?.path) && !fs.existsSync(path.join(rootDir, config.path))) errors.push(`.ai/codebase-map.json: missing configuration ${config.path}`);
    }
    if (array(map.knownTraps).length < 5 || array(map.knownTraps).some((item) => !nonEmpty(item))) {
      errors.push(".ai/codebase-map.json: knownTraps must contain at least five non-empty entries");
    }
    if (map.deploymentModel?.directDeployCommandRegistered !== false) {
      errors.push(".ai/codebase-map.json: deploymentModel must state that no direct live deploy command is registered");
    }
  }

  if (artifacts) {
    const artifactIds = ids(artifacts.artifacts);
    for (const required of ["run-context", "repo-snapshot", "validator-plan", "runtime-proof", "failure-report", "operator-report", "final-handoff", "release-evidence", "prompt"]) {
      if (!artifactIds.has(required)) errors.push(`.ai/artifact-registry.json: missing artifact ${required}`);
    }
    for (const artifact of array(artifacts.artifacts)) {
      requireText("artifact", artifact, ["pathPattern", "producer", "generation", "namingConvention"], errors);
      if (typeof artifact?.tracked !== "boolean") errors.push(`artifact ${artifact?.id ?? "unknown"} requires boolean tracked`);
      if (typeof artifact?.sanitized !== "boolean") errors.push(`artifact ${artifact?.id ?? "unknown"} requires boolean sanitized`);
      if (nonEmpty(artifact?.template) && !fs.existsSync(path.join(rootDir, artifact.template))) errors.push(`artifact ${artifact.id} references missing template ${artifact.template}`);
    }
    for (const forbidden of [".ai/runs/ content", ".ai/generated/ content"]) {
      if (!array(artifacts.forbiddenTrackedOutputs).includes(forbidden)) errors.push(`.ai/artifact-registry.json: must forbid tracking ${forbidden}`);
    }
  }

  const workflowIds = ids(workflows?.workflows);
  if (!workflowIds.has("axtask.failure-recovery.v1")) errors.push(".ai/workflow-registry.json: missing workflow axtask.failure-recovery.v1");
  const failureWorkflow = array(workflows?.workflows).find((item) => item?.id === "axtask.failure-recovery.v1");
  if (failureWorkflow) {
    requireText("workflow", failureWorkflow, ["path", "description"], errors);
    const text = readText(rootDir, failureWorkflow.path, errors);
    for (const heading of ["## Use when", "## Inputs", "## Steps", "## Bounded retry policy", "## Stop conditions", "## Outputs", "## Proof ceiling"]) {
      if (!text.includes(heading)) errors.push(`failure recovery workflow missing ${heading}`);
    }
  }

  const failureTrigger = array(triggers?.triggers).find((item) => item?.id === "validator-or-workflow-failed");
  if (failureTrigger?.workflowId !== "axtask.failure-recovery.v1") errors.push(".ai/trigger-registry.json: validator-or-workflow-failed must route to axtask.failure-recovery.v1");

  const skillComponents = array(harness.components).filter((item) => item?.type === "skill");
  const skillText = skillComponents.map((item) => readText(rootDir, item.path, errors)).join("\n");
  for (const skillId of array(harness.skills)) {
    if (!skillText.includes(skillId)) errors.push(`registered skill has no specification: ${skillId}`);
  }
  if (!array(harness.skills).includes("axtask.skill.failure-recovery.v1")) errors.push(".ai/harness.json: missing failure recovery skill");

  const failureReport = readText(rootDir, ".ai/reports/failure-report-template.md", errors);
  for (const heading of ["## FAILURE", "## CLASSIFICATION", "## REPRODUCTION", "## OWNERSHIP", "## ATTEMPTS", "## VALIDATION STATE", "## REPAIR OR BLOCKER", "## NEXT OWNER"]) {
    if (!failureReport.includes(heading)) errors.push(`failure report template missing ${heading}`);
  }

  if (harness.hookPolicy?.automaticInstall !== false) errors.push(".ai/harness.json: hooks must remain opt-in");
  if (!array(harness.hookPolicy?.preCommitRuns).includes("harness")) errors.push(".ai/harness.json: preCommitRuns must include harness");
  for (const id of ["authority", "harness", "harness-infrastructure", "harness-tests"]) {
    if (!array(harness.hookPolicy?.prePushRuns).includes(id)) errors.push(`.ai/harness.json: prePushRuns must include ${id}`);
  }

  const prePush = readText(rootDir, ".githooks/pre-push", errors);
  for (const expected of ["validate-authority.mjs", "validate-harness.mjs", "validate-harness-infrastructure.mjs", "harness-infrastructure-contract.test.ts", "--no-install"]) {
    if (!prePush.includes(expected)) errors.push(`.githooks/pre-push missing ${expected}`);
  }

  const validatorIds = ids(validators?.validators);
  if (!validatorIds.has("harness-infrastructure")) errors.push(".ai/validator-registry.json: missing validator harness-infrastructure");
  const infrastructureValidator = array(validators?.validators).find((item) => item?.id === "harness-infrastructure");
  if (infrastructureValidator?.command !== "node scripts/ai-harness/validate-harness-infrastructure.mjs") {
    errors.push(".ai/validator-registry.json: harness-infrastructure command mismatch");
  }

  return {
    authorityId: base.authorityId,
    harnessId: base.harnessId,
    componentsChecked: base.componentsChecked,
    errors,
    warnings,
  };
}

function main() {
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_REPO_ROOT;
  const result = validateHarnessInfrastructure(rootDir);
  if (result.errors.length > 0) {
    console.error(`[ai-harness-infrastructure] FAIL harness=${result.harnessId ?? "unknown"} components=${result.componentsChecked}`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[ai-harness-infrastructure] PASS harness=${result.harnessId} components=${result.componentsChecked}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
