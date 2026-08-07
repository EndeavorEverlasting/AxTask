#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readText as readHarnessText, validateHarnessContract } from "./validate-harness.mjs";

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

function requireExistingPath(rootDir, label, relativePath, errors) {
  if (!nonEmpty(relativePath)) {
    errors.push(`${label} requires path`);
    return;
  }
  if (!fs.existsSync(path.join(rootDir, relativePath))) errors.push(`${label} references missing path ${relativePath}`);
}

function requireHeadings(label, text, headings, errors) {
  for (const heading of headings) {
    if (!text.includes(heading)) errors.push(`${label} missing ${heading}`);
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

  const componentTypes = new Set(array(harness.components).map((item) => item?.type).filter(nonEmpty));
  for (const requiredType of [
    "codebase-map",
    "workflow-registry",
    "workflow",
    "artifact-registry",
    "validator-registry",
    "trigger-registry",
    "skill",
    "operator-report",
    "handoff",
    "local-hook",
  ]) {
    if (!componentTypes.has(requiredType)) errors.push(`.ai/harness.json: missing component type ${requiredType}`);
  }
  for (const component of array(harness.components)) {
    requireText("harness component", component, ["id", "type", "path"], errors);
    requireExistingPath(rootDir, `harness component ${component?.id ?? "unknown"}`, component?.path, errors);
  }

  if (map) {
    const commandIds = ids(map.commands);
    for (const required of ["install", "development", "typecheck", "test", "build", "deploy-contract", "production-start"]) {
      if (!commandIds.has(required)) errors.push(`.ai/codebase-map.json: missing command ${required}`);
    }
    for (const command of array(map.commands)) requireText("codebase command", command, ["command", "role", "mutation"], errors);

    const entryPointIds = ids(map.entryPoints);
    for (const required of ["server", "client", "schema", "toolchain", "deploy"]) {
      if (!entryPointIds.has(required)) errors.push(`.ai/codebase-map.json: missing entry point ${required}`);
    }
    for (const entryPoint of array(map.entryPoints)) {
      requireText("entry point", entryPoint, ["path", "role"], errors);
      requireExistingPath(rootDir, `entry point ${entryPoint?.id ?? "unknown"}`, entryPoint?.path, errors);
    }

    const roots = new Set(array(map.roots).map((item) => item?.path).filter(nonEmpty));
    for (const required of ["client/src", "server", "shared", "scripts", "tests", "docs", ".ai", ".githooks"]) {
      if (!roots.has(required)) errors.push(`.ai/codebase-map.json: missing repository root ${required}`);
    }
    for (const root of array(map.roots)) {
      requireText("repository root", root, ["path", "role"], errors);
      requireExistingPath(rootDir, `repository root ${root?.path ?? "unknown"}`, root?.path, errors);
    }

    for (const config of array(map.configurations)) {
      requireText("configuration", config, ["path", "role"], errors);
      requireExistingPath(rootDir, `configuration ${config?.path ?? "unknown"}`, config?.path, errors);
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
      if (nonEmpty(artifact?.template)) requireExistingPath(rootDir, `artifact ${artifact.id} template`, artifact.template, errors);
      if (nonEmpty(artifact?.schema)) requireExistingPath(rootDir, `artifact ${artifact.id} schema`, artifact.schema, errors);
    }
    for (const forbidden of [".ai/runs/ content", ".ai/generated/ content"]) {
      if (!array(artifacts.forbiddenTrackedOutputs).includes(forbidden)) errors.push(`.ai/artifact-registry.json: must forbid tracking ${forbidden}`);
    }
  }

  const workflowIds = ids(workflows?.workflows);
  for (const workflow of array(workflows?.workflows)) {
    requireText("workflow", workflow, ["path", "description"], errors);
    requireExistingPath(rootDir, `workflow ${workflow?.id ?? "unknown"}`, workflow?.path, errors);
  }
  for (const required of ["axtask.repository-intake.v1", "axtask.pr-closeout.v1", "axtask.failure-recovery.v1"]) {
    if (!workflowIds.has(required)) errors.push(`.ai/workflow-registry.json: missing workflow ${required}`);
  }

  for (const workflowId of ["axtask.repository-intake.v1", "axtask.pr-closeout.v1"]) {
    const workflow = array(workflows?.workflows).find((item) => item?.id === workflowId);
    if (workflow) {
      const text = readHarnessText(rootDir, workflow.path, errors);
      requireHeadings(`workflow ${workflowId}`, text, ["## Use when", "## Inputs", "## Steps"], errors);
    }
  }

  const failureWorkflow = array(workflows?.workflows).find((item) => item?.id === "axtask.failure-recovery.v1");
  if (failureWorkflow) {
    const text = readHarnessText(rootDir, failureWorkflow.path, errors);
    requireHeadings("failure recovery workflow", text, ["## Use when", "## Inputs", "## Steps", "## Bounded retry policy", "## Stop conditions", "## Outputs", "## Proof ceiling"], errors);
  }

  for (const trigger of array(triggers?.triggers)) {
    requireText("trigger", trigger, ["id"], errors);
    const targetCount = [trigger?.workflowId, trigger?.skillId].filter(nonEmpty).length;
    if (targetCount === 0) errors.push(`trigger ${trigger?.id ?? "unknown"} requires workflowId or skillId`);
    if (nonEmpty(trigger?.workflowId) && !workflowIds.has(trigger.workflowId)) errors.push(`trigger ${trigger.id} references unknown workflow ${trigger.workflowId}`);
  }

  const failureTrigger = array(triggers?.triggers).find((item) => item?.id === "validator-or-workflow-failed");
  if (failureTrigger?.workflowId !== "axtask.failure-recovery.v1") errors.push(".ai/trigger-registry.json: validator-or-workflow-failed must route to axtask.failure-recovery.v1");

  const skillComponents = array(harness.components).filter((item) => item?.type === "skill");
  const skillText = skillComponents.map((item) => readHarnessText(rootDir, item?.path, errors)).join("\n");
  for (const skillId of array(harness.skills)) {
    if (!skillText.includes(skillId)) errors.push(`registered skill has no specification: ${skillId}`);
  }
  if (!array(harness.skills).includes("axtask.skill.failure-recovery.v1")) errors.push(".ai/harness.json: missing failure recovery skill");

  const operatorReport = readHarnessText(rootDir, ".ai/reports/operator-report-template.md", errors);
  requireHeadings("operator report template", operatorReport, [
    "## REPO EVIDENCE",
    "## WORKFLOW",
    "## WORK COMMITTED",
    "## VALIDATION",
    "## GAPS / RISKS",
    "## FINAL GIT STATE",
    "## NEXT COMMAND",
  ], errors);

  const failureReport = readHarnessText(rootDir, ".ai/reports/failure-report-template.md", errors);
  requireHeadings("failure report template", failureReport, ["## FAILURE", "## CLASSIFICATION", "## REPRODUCTION", "## OWNERSHIP", "## ATTEMPTS", "## VALIDATION STATE", "## REPAIR OR BLOCKER", "## NEXT OWNER"], errors);

  const handoff = readHarnessText(rootDir, ".ai/handoff/final-handoff-template.md", errors);
  requireHeadings("final handoff template", handoff, ["## Identity", "## Durable facts", "## Validation", "## Remaining work", "## Compression rules"], errors);

  if (harness.hookPolicy?.automaticInstall !== false) errors.push(".ai/harness.json: hooks must remain opt-in");
  if (!array(harness.hookPolicy?.preCommitRuns).includes("harness")) errors.push(".ai/harness.json: preCommitRuns must include harness");
  for (const id of ["authority", "harness", "harness-infrastructure", "harness-tests"]) {
    if (!array(harness.hookPolicy?.prePushRuns).includes(id)) errors.push(`.ai/harness.json: prePushRuns must include ${id}`);
  }

  const preCommit = readHarnessText(rootDir, ".githooks/pre-commit", errors);
  for (const expected of ["check_node_provenance.mjs", "check_node_runtime.mjs", "check_no_axios.mjs", "validate-authority.mjs", "validate-harness.mjs"]) {
    if (!preCommit.includes(expected)) errors.push(`.githooks/pre-commit missing ${expected}`);
  }

  const prePush = readHarnessText(rootDir, ".githooks/pre-push", errors);
  for (const expected of ["validate-authority.mjs", "validate-harness.mjs", "validate-harness-infrastructure.mjs", "harness-infrastructure-contract.test.ts", "--no-install"]) {
    if (!prePush.includes(expected)) errors.push(`.githooks/pre-push missing ${expected}`);
  }

  const validatorIds = ids(validators?.validators);
  if (!validatorIds.has("harness-infrastructure")) errors.push(".ai/validator-registry.json: missing validator harness-infrastructure");
  const infrastructureValidator = array(validators?.validators).find((item) => item?.id === "harness-infrastructure");
  if (infrastructureValidator?.command !== "node scripts/ai-harness/validate-harness-infrastructure.mjs") {
    errors.push(".ai/validator-registry.json: harness-infrastructure command mismatch");
  }
  for (const validator of array(validators?.validators)) {
    requireText("validator", validator, ["id", "command"], errors);
  }

  return {
    authorityId: base.authorityId,
    harnessId: base.harnessId,
    componentsChecked: base.componentsChecked,
    operationalSurfaces: {
      components: array(harness.components).length,
      workflows: array(workflows?.workflows).length,
      artifacts: array(artifacts?.artifacts).length,
      validators: array(validators?.validators).length,
      triggers: array(triggers?.triggers).length,
      skills: array(harness.skills).length,
    },
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
  const surfaces = result.operationalSurfaces ?? {};
  console.log(`[ai-harness-infrastructure] PASS harness=${result.harnessId} components=${result.componentsChecked} workflows=${surfaces.workflows ?? 0} artifacts=${surfaces.artifacts ?? 0} validators=${surfaces.validators ?? 0} triggers=${surfaces.triggers ?? 0} skills=${surfaces.skills ?? 0}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
