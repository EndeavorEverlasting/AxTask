#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateAuthorityContract } from "./validate-authority.mjs";

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

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function ids(items) {
  return new Set(array(items).map((item) => item?.id).filter(nonEmpty));
}

function commandScriptPath(command) {
  return command.match(/^node\s+([^\s]+\.mjs)(?:\s|$)/)?.[1] ?? null;
}

export function validateHarnessContract(rootDir = DEFAULT_REPO_ROOT) {
  const errors = [];
  const warnings = [];
  const authorityResult = validateAuthorityContract(rootDir);
  errors.push(...authorityResult.errors);

  const harness = readJson(rootDir, ".ai/harness.json", errors);
  const map = readJson(rootDir, ".ai/codebase-map.json", errors);
  const runContext = readJson(rootDir, ".ai/run-context.schema.json", errors);
  const artifacts = readJson(rootDir, ".ai/artifact-registry.json", errors);
  const validators = readJson(rootDir, ".ai/validator-registry.json", errors);

  if (!harness) return { authorityId: authorityResult.authorityId, componentsChecked: 0, errors, warnings };
  if (harness.schemaVersion !== 1) errors.push(".ai/harness.json: schemaVersion must equal 1");
  if (harness.authorityRef !== authorityResult.authorityId) errors.push(".ai/harness.json: authorityRef must match authority.json authorityId");
  if (harness.harnessId !== "axtask.repo-harness.v1") errors.push(".ai/harness.json: harnessId must equal axtask.repo-harness.v1");
  if (!nonEmpty(harness.entryPoint) || !fs.existsSync(path.join(rootDir, harness.entryPoint))) errors.push(".ai/harness.json: entryPoint must reference an existing file");

  const requiredTypes = new Set([
    "repo-rules", "authority", "codebase-map", "workflow", "run-context",
    "artifact-registry", "validator-registry", "skill", "read-only-intelligence",
    "operator-report", "handoff", "local-hook",
  ]);
  const components = array(harness.components);
  const componentIds = new Set();
  const presentTypes = new Set();
  for (const component of components) {
    if (!component || typeof component !== "object" || Array.isArray(component)) {
      errors.push(".ai/harness.json: every component must be an object");
      continue;
    }
    if (!nonEmpty(component.id)) errors.push(".ai/harness.json: component id must be a non-empty string");
    if (componentIds.has(component.id)) errors.push(`.ai/harness.json: duplicate component id ${component.id}`);
    componentIds.add(component.id);
    if (!nonEmpty(component.type)) errors.push(`.ai/harness.json: component ${component.id} has no type`);
    presentTypes.add(component.type);
    if (!nonEmpty(component.path) || !fs.existsSync(path.join(rootDir, component.path))) errors.push(`.ai/harness.json: component ${component.id} references missing path ${component.path}`);
  }
  for (const type of requiredTypes) if (!presentTypes.has(type)) errors.push(`.ai/harness.json: missing required component type ${type}`);

  if (map) {
    if (map.authorityRef !== authorityResult.authorityId) errors.push(".ai/codebase-map.json: authorityRef mismatch");
    for (const item of [...array(map.entryPoints), ...array(map.roots)]) {
      if (!nonEmpty(item?.path) || !fs.existsSync(path.join(rootDir, item.path))) errors.push(`.ai/codebase-map.json: missing mapped path ${item?.path}`);
    }
    if (array(map.validationSurfaces).length === 0) errors.push(".ai/codebase-map.json: validationSurfaces must not be empty");
  }

  if (runContext) {
    if (runContext.authorityRef !== authorityResult.authorityId) errors.push(".ai/run-context.schema.json: authorityRef mismatch");
    const required = new Set(array(runContext.required));
    for (const field of ["workflowId","repoRoot","branch","head","baseRef","ownedScope","forbiddenScope","expectedArtifacts","validation","proofCeiling"]) {
      if (!required.has(field)) errors.push(`.ai/run-context.schema.json: missing required field ${field}`);
    }
    if (runContext.runtimePolicy?.tracked !== false) errors.push(".ai/run-context.schema.json: runtimePolicy.tracked must be false");
    if (runContext.runtimePolicy?.secretsAllowed !== false) errors.push(".ai/run-context.schema.json: secretsAllowed must be false");
  }

  const artifactIds = ids(artifacts?.artifacts);
  for (const requiredArtifact of ["run-context","repo-snapshot","operator-report","final-handoff","release-evidence","prompt"]) {
    if (!artifactIds.has(requiredArtifact)) errors.push(`.ai/artifact-registry.json: missing artifact ${requiredArtifact}`);
  }
  const promptArtifact = array(artifacts?.artifacts).find((item) => item?.id === "prompt");
  if (!promptArtifact?.note?.includes("not the harness")) errors.push(".ai/artifact-registry.json: prompt artifact must state that prompts are not the harness");

  const validatorIds = ids(validators?.validators);
  for (const requiredValidator of ["authority","harness","harness-tests","release","typecheck","tests","build"]) {
    if (!validatorIds.has(requiredValidator)) errors.push(`.ai/validator-registry.json: missing validator ${requiredValidator}`);
  }
  for (const validator of array(validators?.validators)) {
    if (!nonEmpty(validator?.command)) {
      errors.push(`.ai/validator-registry.json: validator ${validator?.id} has no command`);
      continue;
    }
    const scriptPath = commandScriptPath(validator.command);
    if (scriptPath && !fs.existsSync(path.join(rootDir, scriptPath))) errors.push(`.ai/validator-registry.json: validator ${validator.id} references missing script ${scriptPath}`);
  }

  const workflowIds = new Set(array(harness.workflows));
  const skillIds = new Set(array(harness.skills));
  for (const trigger of array(harness.triggers)) {
    if (trigger.workflowId && !workflowIds.has(trigger.workflowId)) errors.push(`.ai/harness.json: trigger ${trigger.event} references unknown workflow ${trigger.workflowId}`);
    if (trigger.skillId && !skillIds.has(trigger.skillId)) errors.push(`.ai/harness.json: trigger ${trigger.event} references unknown skill ${trigger.skillId}`);
  }
  if (harness.readOnlyIntelligence?.mutationAllowed !== false) errors.push(".ai/harness.json: readOnlyIntelligence.mutationAllowed must be false");
  if (harness.hookPolicy?.automaticInstall !== false) errors.push(".ai/harness.json: hookPolicy.automaticInstall must be false");

  const workflowText = [
    readText(rootDir, ".ai/workflows/repository-intake.md", errors),
    readText(rootDir, ".ai/workflows/pr-closeout.md", errors),
  ].join("\n");
  for (const workflowId of workflowIds) if (!workflowText.includes(workflowId)) errors.push(`workflow specifications do not define ${workflowId}`);
  const skillText = [
    readText(rootDir, ".ai/skills/repository-intake.md", errors),
    readText(rootDir, ".ai/skills/pr-closeout.md", errors),
    readText(rootDir, ".ai/skills/harness-maintenance.md", errors),
  ].join("\n");
  for (const skillId of skillIds) if (!skillText.includes(skillId)) errors.push(`skill specifications do not define ${skillId}`);

  const report = readText(rootDir, ".ai/reports/operator-report-template.md", errors);
  for (const heading of ["## REPO EVIDENCE","## WORKFLOW","## WORK COMMITTED","## VALIDATION","## GAPS / RISKS","## FINAL GIT STATE","## NEXT COMMAND"]) {
    if (!report.includes(heading)) errors.push(`operator report template missing ${heading}`);
  }
  const handoff = readText(rootDir, ".ai/handoff/final-handoff-template.md", errors);
  for (const heading of ["## Identity","## Durable facts","## Validation","## Remaining work","## Compression rules"]) {
    if (!handoff.includes(heading)) errors.push(`final handoff template missing ${heading}`);
  }

  const gitignore = readText(rootDir, ".gitignore", errors);
  for (const ignored of [".ai/runs/", ".ai/generated/"]) {
    if (!gitignore.split(/\r?\n/).includes(ignored)) errors.push(`.gitignore missing ${ignored}`);
  }

  const hook = readText(rootDir, ".githooks/pre-commit", errors);
  if (!hook.includes("validate-authority.mjs") || !hook.includes("validate-harness.mjs")) errors.push(".githooks/pre-commit must run both harness validators");
  const installer = readText(rootDir, "scripts/ai-harness/install-hooks.mjs", errors);
  if (!installer.includes("core.hooksPath") || !installer.includes("--force")) errors.push("hook installer must be explicit and protect existing core.hooksPath");
  const inspector = readText(rootDir, "scripts/ai-harness/inspect-repo.mjs", errors);
  for (const forbidden of ["git reset", "git clean", "git checkout", "git commit", "git push"]) {
    if (inspector.includes(forbidden)) errors.push(`read-only inspector contains mutation command ${forbidden}`);
  }

  return { authorityId: authorityResult.authorityId, harnessId: harness.harnessId, componentsChecked: components.length, errors, warnings };
}

function main() {
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_REPO_ROOT;
  const result = validateHarnessContract(rootDir);
  if (result.errors.length > 0) {
    console.error(`[ai-harness] FAIL harness=${result.harnessId ?? "unknown"} components=${result.componentsChecked}`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[ai-harness] PASS harness=${result.harnessId} components=${result.componentsChecked}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
