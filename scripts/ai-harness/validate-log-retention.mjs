#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

function readText(rootDir, relativePath, errors) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`missing file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readJson(rootDir, relativePath, errors) {
  const text = readText(rootDir, relativePath, errors);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${relativePath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function includesLine(text, fragments) {
  return text.split(/\r?\n/).some((line) => fragments.every((fragment) => line.includes(fragment)));
}

function serviceBlock(renderText, serviceName) {
  return renderText
    .split(/\n(?=  - type: )/g)
    .find((block) => block.includes(`name: ${serviceName}`)) ?? "";
}

function registered(items, id) {
  return array(items).some((item) => item?.id === id);
}

export function validateLogRetentionHarness(rootDir = DEFAULT_REPO_ROOT) {
  const errors = [];
  const warnings = [];
  const contract = readJson(rootDir, ".ai/log-retention-contract.json", errors);
  if (!contract) return { contractId: null, errors, warnings, checks: {} };

  if (contract.authorityRef !== "axtask.agent-authority.v1") {
    errors.push(".ai/log-retention-contract.json: authorityRef mismatch");
  }

  const sources = contract.canonicalSources ?? {};
  const policy = readText(rootDir, sources.policy ?? "docs/DB_RETENTION_POLICY.md", errors);
  const runner = readText(rootDir, sources.runner ?? "scripts/db-retention.mjs", errors);
  const render = readText(rootDir, sources.scheduler ?? "render.yaml", errors);
  const controls = readText(rootDir, sources.runtimeControls ?? "docs/SCHEDULED_RESOURCE_CONTROLS.md", errors);

  let sentinelChecks = 0;
  for (const sentinel of array(contract.criticalSentinels)) {
    const { table, column, window } = sentinel ?? {};
    if (![table, column, window].every((value) => typeof value === "string" && value.length > 0)) {
      errors.push(`invalid critical sentinel: ${sentinel?.id ?? "unknown"}`);
      continue;
    }
    sentinelChecks++;
    if (!includesLine(policy, [`\`${table}\``, `\`${column}\``, window])) {
      errors.push(`retention policy missing ${table}.${column} ${window}`);
    }
    if (!includesLine(runner, [`table: "${table}"`, `column: "${column}"`, `window: "${window}"`])) {
      errors.push(`retention runner missing ${table}.${column} ${window}`);
    }
  }

  const scheduler = contract.scheduler ?? {};
  const cronBlock = serviceBlock(render, scheduler.serviceName ?? "axtask-db-retention");
  if (!cronBlock) {
    errors.push(`render.yaml: missing cron service ${scheduler.serviceName ?? "axtask-db-retention"}`);
  } else {
    if (!cronBlock.includes("- type: cron")) errors.push("render.yaml: retention service must be type cron");
    if (!cronBlock.includes(`schedule: "${scheduler.schedule}"`)) errors.push(`render.yaml: retention cron schedule must be ${scheduler.schedule}`);
    if (!cronBlock.includes(`startCommand: ${scheduler.command}`)) errors.push(`render.yaml: retention cron command must be ${scheduler.command}`);
    for (const envKey of array(scheduler.requiredEnv)) {
      if (!cronBlock.includes(`key: ${envKey}`)) errors.push(`render.yaml: retention cron missing required env ${envKey}`);
    }
    if (scheduler.disabledFlag && cronBlock.includes(`key: ${scheduler.disabledFlag}`)) {
      const disabledPattern = new RegExp(`key:\\s*${scheduler.disabledFlag}[\\s\\S]{0,120}?value:\\s*["']?${scheduler.disabledValue ?? "true"}["']?`);
      if (disabledPattern.test(cronBlock)) errors.push(`render.yaml: retention cron is repo-disabled by ${scheduler.disabledFlag}`);
    }
  }

  if (!includesLine(controls, ["Render cron retention", "**On**"])) {
    errors.push("docs/SCHEDULED_RESOURCE_CONTROLS.md: Render cron retention must be documented On");
  }
  if (!includesLine(controls, ["In-process retention prune", "**On**"])) {
    warnings.push("docs/SCHEDULED_RESOURCE_CONTROLS.md: in-process retention prune is not documented On");
  }
  if (!controls.includes(contract.proof?.liveObservationMarker ?? "[retention] done. rows_deleted=")) {
    errors.push("docs/SCHEDULED_RESOURCE_CONTROLS.md: missing live retention verification marker");
  }
  if (contract.proof?.repoValidationProvesLiveExecution !== false) {
    errors.push("log retention contract must state repoValidationProvesLiveExecution=false");
  }

  const harness = readJson(rootDir, ".ai/harness.json", errors);
  const workflows = readJson(rootDir, ".ai/workflow-registry.json", errors);
  const artifacts = readJson(rootDir, ".ai/artifact-registry.json", errors);
  const validators = readJson(rootDir, ".ai/validator-registry.json", errors);
  const triggers = readJson(rootDir, ".ai/trigger-registry.json", errors);
  const map = readJson(rootDir, ".ai/codebase-map.json", errors);
  const prePush = readText(rootDir, ".githooks/pre-push", errors);

  for (const componentId of [
    "log-retention-contract",
    "log-retention-workflow",
    "log-retention-skill",
    "log-retention-validator",
    "log-retention-report",
  ]) {
    if (!registered(harness?.components, componentId)) errors.push(`.ai/harness.json: missing component ${componentId}`);
  }
  if (!array(harness?.skills).includes("axtask.skill.log-retention-capacity-defense.v1")) {
    errors.push(".ai/harness.json: missing log retention skill registration");
  }
  if (!array(harness?.hookPolicy?.prePushRuns).includes("log-retention")) {
    errors.push(".ai/harness.json: prePushRuns must include log-retention");
  }
  if (!registered(workflows?.workflows, "axtask.log-retention-capacity-defense.v1")) {
    errors.push(".ai/workflow-registry.json: missing log retention workflow");
  }
  for (const artifactId of ["log-retention-proof", "log-retention-report"]) {
    if (!registered(artifacts?.artifacts, artifactId)) errors.push(`.ai/artifact-registry.json: missing artifact ${artifactId}`);
  }
  const retentionValidator = array(validators?.validators).find((item) => item?.id === "log-retention");
  if (retentionValidator?.command !== "node scripts/ai-harness/validate-log-retention.mjs") {
    errors.push(".ai/validator-registry.json: log-retention command mismatch");
  }
  const retentionTrigger = array(triggers?.triggers).find((item) => item?.id === "log-retention-risk");
  if (retentionTrigger?.workflowId !== "axtask.log-retention-capacity-defense.v1") {
    errors.push(".ai/trigger-registry.json: log-retention-risk must route to log retention workflow");
  }
  if (!registered(map?.commands, "retention-harness")) {
    errors.push(".ai/codebase-map.json: missing retention-harness command");
  }
  for (const expected of ["validate-log-retention.mjs", "log-retention-harness-contract.test.ts"]) {
    if (!prePush.includes(expected)) errors.push(`.githooks/pre-push missing ${expected}`);
  }

  return {
    contractId: contract.contractId ?? null,
    authorityRef: contract.authorityRef ?? null,
    checks: {
      sentinelChecks,
      repoScheduleWired: errors.every((error) => !error.startsWith("render.yaml:")),
      liveExecutionProven: false,
      liveObservationMarker: contract.proof?.liveObservationMarker ?? null,
    },
    errors,
    warnings,
  };
}

function main() {
  const result = validateLogRetentionHarness(DEFAULT_REPO_ROOT);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.errors.length === 0) {
    console.log(`[ai-log-retention] PASS contract=${result.contractId} sentinels=${result.checks.sentinelChecks} live=UNPROVEN`);
    for (const warning of result.warnings) console.warn(`- warning: ${warning}`);
  } else {
    console.error(`[ai-log-retention] FAIL contract=${result.contractId ?? "unknown"}`);
    for (const error of result.errors) console.error(`- ${error}`);
  }
  if (result.errors.length > 0) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
