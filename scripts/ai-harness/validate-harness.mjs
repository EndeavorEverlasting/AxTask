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

export function duplicateIds(items) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of array(items)) {
    if (!nonEmpty(item?.id)) continue;
    if (seen.has(item.id)) duplicates.add(item.id);
    seen.add(item.id);
  }
  return [...duplicates].sort();
}

export function validateTriggerRoutes(triggerItems, workflowIds, skillIds, capabilityIds) {
  const errors = [];
  for (const trigger of array(triggerItems)) {
    const routes = [trigger?.workflowId, trigger?.skillId, trigger?.capabilityId].filter(nonEmpty);
    if (routes.length !== 1) {
      errors.push(`trigger ${trigger?.id ?? "unknown"} must define exactly one workflowId, skillId, or capabilityId`);
      continue;
    }
    if (trigger.workflowId && !workflowIds.has(trigger.workflowId)) errors.push(`trigger ${trigger.id} references unknown workflow ${trigger.workflowId}`);
    if (trigger.skillId && !skillIds.has(trigger.skillId)) errors.push(`trigger ${trigger.id} references unknown skill ${trigger.skillId}`);
    if (trigger.capabilityId && !capabilityIds.has(trigger.capabilityId)) errors.push(`trigger ${trigger.id} references unknown capability ${trigger.capabilityId}`);
  }
  return errors;
}

function commandScriptPath(command) {
  return command.match(/^node\s+([^\s]+\.mjs)(?:\s|$)/)?.[1] ?? null;
}

function requireMetadata(label, item, fields, errors) {
  for (const field of fields) {
    const value = item?.[field];
    if (Array.isArray(value)) {
      if (value.length === 0 || value.some((entry) => !nonEmpty(entry))) errors.push(`${label} ${item?.id ?? "unknown"} requires non-empty ${field}`);
    } else if (!nonEmpty(value)) {
      errors.push(`${label} ${item?.id ?? "unknown"} requires ${field}`);
    }
  }
}

export function validateHarnessContract(rootDir = DEFAULT_REPO_ROOT) {
  const errors = [];
  const warnings = [];
  const authorityResult = validateAuthorityContract(rootDir);
  errors.push(...authorityResult.errors);

  const harness = readJson(rootDir, ".ai/harness.json", errors);
  const map = readJson(rootDir, ".ai/codebase-map.json", errors);
  const runContext = readJson(rootDir, ".ai/run-context.schema.json", errors);
  const runtimeProof = readJson(rootDir, ".ai/runtime-proof.schema.json", errors);
  const artifacts = readJson(rootDir, ".ai/artifact-registry.json", errors);
  const validators = readJson(rootDir, ".ai/validator-registry.json", errors);
  const capabilities = readJson(rootDir, ".ai/capability-registry.json", errors);
  const triggers = readJson(rootDir, ".ai/trigger-registry.json", errors);
  const workflows = readJson(rootDir, ".ai/workflow-registry.json", errors);
  const ownership = readJson(rootDir, ".ai/ownership-rules.json", errors);

  if (!harness) return { authorityId: authorityResult.authorityId, componentsChecked: 0, errors, warnings };
  if (harness.schemaVersion !== 1) errors.push(".ai/harness.json: schemaVersion must equal 1");
  if (harness.authorityRef !== authorityResult.authorityId) errors.push(".ai/harness.json: authorityRef must match authority.json authorityId");
  if (harness.harnessId !== "axtask.repo-harness.v1") errors.push(".ai/harness.json: harnessId must equal axtask.repo-harness.v1");
  if (!nonEmpty(harness.entryPoint) || !fs.existsSync(path.join(rootDir, harness.entryPoint))) errors.push(".ai/harness.json: entryPoint must reference an existing file");

  const requiredTypes = new Set([
    "repo-rules", "authority", "codebase-map", "workflow-registry", "workflow", "run-context",
    "runtime-proof", "artifact-registry", "validator-registry", "capability-registry",
    "trigger-registry", "ownership-rules", "skill", "read-only-intelligence",
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
    for (const field of ["workflowId","ownerRole","activationReason","repoRoot","branch","head","baseRef","environmentClass","candidateSha","ownedScope","forbiddenScope","expectedArtifacts","likelyFiles","collisionFiles","selectedSkills","selectedCapabilities","selectedTriggers","preconditions","forbiddenConditions","targetedValidators","validation","requiredProofLevels","attainedProofLevels","proofCeiling"]) {
      if (!required.has(field)) errors.push(`.ai/run-context.schema.json: missing required field ${field}`);
    }
    if (runContext.runtimePolicy?.tracked !== false) errors.push(".ai/run-context.schema.json: runtimePolicy.tracked must be false");
    if (runContext.runtimePolicy?.secretsAllowed !== false) errors.push(".ai/run-context.schema.json: secretsAllowed must be false");
    if (runContext.runtimePolicy?.rawLogsAllowed !== false) errors.push(".ai/run-context.schema.json: rawLogsAllowed must be false");
  }

  if (runtimeProof) {
    if (runtimeProof.authorityRef !== authorityResult.authorityId) errors.push(".ai/runtime-proof.schema.json: authorityRef mismatch");
    const required = new Set(array(runtimeProof.required));
    for (const field of ["candidateSha","environmentClass","commands","timestamps","assertions","failures","skippedEvidence","attainedProofLevel","proofCeiling","operatorAcceptance"]) {
      if (!required.has(field)) errors.push(`.ai/runtime-proof.schema.json: missing required field ${field}`);
    }
    for (const field of array(runtimeProof.proofEscalationRules?.live?.requires)) {
      if (!runtimeProof.properties?.[field]) errors.push(`.ai/runtime-proof.schema.json: live requirement ${field} must have a property definition`);
    }
  }

  const artifactIds = ids(artifacts?.artifacts);
  for (const requiredArtifact of ["run-context","repo-snapshot","operator-report","final-handoff","release-evidence","prompt"]) {
    if (!artifactIds.has(requiredArtifact)) errors.push(`.ai/artifact-registry.json: missing artifact ${requiredArtifact}`);
  }
  const promptArtifact = array(artifacts?.artifacts).find((item) => item?.id === "prompt");
  if (!promptArtifact?.note?.includes("not the harness")) errors.push(".ai/artifact-registry.json: prompt artifact must state that prompts are not the harness");
  if (!array(artifacts?.forbiddenTrackedOutputs).includes(".ai/runs/ content")) errors.push(".ai/artifact-registry.json: must forbid tracking .ai/runs/ content");

  const validatorIds = ids(validators?.validators);
  for (const requiredValidator of ["authority","harness","run-context","runtime-proof","harness-tests","release","typecheck","tests","build"]) {
    if (!validatorIds.has(requiredValidator)) errors.push(`.ai/validator-registry.json: missing validator ${requiredValidator}`);
  }
  for (const duplicate of duplicateIds(validators?.validators)) errors.push(`.ai/validator-registry.json: duplicate validator id ${duplicate}`);
  for (const validator of array(validators?.validators)) {
    if (!nonEmpty(validator?.command)) {
      errors.push(`.ai/validator-registry.json: validator ${validator?.id} has no command`);
      continue;
    }
    const scriptPath = commandScriptPath(validator.command);
    if (scriptPath && !fs.existsSync(path.join(rootDir, scriptPath))) errors.push(`.ai/validator-registry.json: validator ${validator.id} references missing script ${scriptPath}`);
  }

  const capabilityIds = ids(capabilities?.capabilities);
  for (const requiredCapability of ["repository-inspection","pr-collision-inspection","validator-selection","local-production-certification","runtime-proof-recording"]) {
    if (!capabilityIds.has(requiredCapability)) errors.push(`.ai/capability-registry.json: missing capability ${requiredCapability}`);
  }
  for (const duplicate of duplicateIds(capabilities?.capabilities)) errors.push(`.ai/capability-registry.json: duplicate capability id ${duplicate}`);
  for (const capability of array(capabilities?.capabilities)) {
    if (!["available","planned"].includes(capability?.status)) errors.push(`.ai/capability-registry.json: capability ${capability?.id} has invalid status`);
    requireMetadata("capability", capability, ["canonicalOwner","activation","outputs","guardrails","tests","proofLevel"], errors);
    if (capability?.status === "available") {
      if (!nonEmpty(capability.command)) errors.push(`.ai/capability-registry.json: available capability ${capability?.id} requires command`);
      if (nonEmpty(capability.plannedCommand)) errors.push(`.ai/capability-registry.json: available capability ${capability?.id} must not use plannedCommand`);
      const scriptPath = commandScriptPath(capability.command ?? "");
      if (scriptPath && !fs.existsSync(path.join(rootDir, scriptPath))) errors.push(`.ai/capability-registry.json: available capability ${capability.id} references missing script ${scriptPath}`);
    }
    if (capability?.status === "planned") {
      if (!nonEmpty(capability.plannedCommand)) errors.push(`.ai/capability-registry.json: planned capability ${capability?.id} requires plannedCommand`);
      if (nonEmpty(capability.command)) errors.push(`.ai/capability-registry.json: planned capability ${capability?.id} must not expose command as available`);
    }
  }

  const workflowIdsFromRegistry = ids(workflows?.workflows);
  for (const requiredWorkflow of ["axtask.repository-intake.v1","axtask.pr-closeout.v1","axtask.failure-recovery.v1","axtask.local-deployment-certification.v1"]) {
    if (!workflowIdsFromRegistry.has(requiredWorkflow)) errors.push(`.ai/workflow-registry.json: missing workflow ${requiredWorkflow}`);
  }
  for (const duplicate of duplicateIds(workflows?.workflows)) errors.push(`.ai/workflow-registry.json: duplicate workflow id ${duplicate}`);
  for (const workflow of array(workflows?.workflows)) {
    if (!nonEmpty(workflow?.path) || !fs.existsSync(path.join(rootDir, workflow.path))) errors.push(`.ai/workflow-registry.json: workflow ${workflow?.id} references missing path ${workflow?.path}`);
  }

  const triggerIds = ids(triggers?.triggers);
  for (const requiredTrigger of ["new-agent-session","close-pr-or-merge","validator-or-workflow-failed","harness-files-changed","deployment-sensitive-files-changed","local-certification-requested","candidate-current-and-green","runtime-proof-missing","live-mutation-without-authorization"]) {
    if (!triggerIds.has(requiredTrigger)) errors.push(`.ai/trigger-registry.json: missing trigger ${requiredTrigger}`);
  }
  for (const duplicate of duplicateIds(triggers?.triggers)) errors.push(`.ai/trigger-registry.json: duplicate trigger id ${duplicate}`);
  const harnessSkillIds = new Set(array(harness.skills));
  errors.push(...validateTriggerRoutes(array(triggers?.triggers), workflowIdsFromRegistry, harnessSkillIds, capabilityIds).map((error) => `.ai/trigger-registry.json: ${error}`));

  if (ownership) {
    if (ownership.authorityRef !== authorityResult.authorityId) errors.push(".ai/ownership-rules.json: authorityRef mismatch");
    const ownedPaths = new Set(array(ownership?.rules).map((rule) => rule?.surface).filter(nonEmpty));
    for (const requiredSurface of [".ai/**","render.yaml","scripts/production-start.mjs","scripts/deploy/**","scripts/db/**","migrations/**","package.json","tests/deploy/**"]) {
      if (!ownedPaths.has(requiredSurface)) errors.push(`.ai/ownership-rules.json: missing ownership rule for ${requiredSurface}`);
    }
  }

  if (harness.readOnlyIntelligence?.mutationAllowed !== false) errors.push(".ai/harness.json: readOnlyIntelligence.mutationAllowed must be false");
  if (harness.hookPolicy?.automaticInstall !== false) errors.push(".ai/harness.json: hookPolicy.automaticInstall must be false");

  const workflowText = array(workflows?.workflows).map((workflow) => readText(rootDir, workflow?.path, errors)).join("\n");
  for (const workflowId of workflowIdsFromRegistry) if (!workflowText.includes(workflowId)) errors.push(`workflow specifications do not define ${workflowId}`);

  const skillComponents = components.filter((component) => component?.type === "skill");
  const skillText = skillComponents.map((component) => readText(rootDir, component?.path, errors)).join("\n");
  for (const skillId of harnessSkillIds) if (!skillText.includes(skillId)) errors.push(`skill specifications do not define ${skillId}`);

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
