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

/**
 * Parse the render.yaml cron service block by locating the service name field
 * and walking the block boundaries, rather than relying on brittle split patterns.
 */
function findCronServiceBlock(renderText, serviceName) {
  const lines = renderText.split(/\r?\n/);
  let nameLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(`name: ${serviceName}`)) {
      nameLineIdx = i;
      break;
    }
  }
  if (nameLineIdx === -1) return "";

  let start = nameLineIdx;
  for (let i = nameLineIdx - 1; i >= 0; i--) {
    if (/^\s*- /.test(lines[i])) { start = i; break; }
  }

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^  - /.test(lines[i])) { end = i; break; }
  }

  return lines.slice(start, end).join("\n");
}

/**
 * Check that table and column names co-occur in the same row of a Markdown table,
 * and that the retention window appears on that same row. This is formatting-independent:
 * it does not require all fragments on one physical line or exact indentation.
 */
function includesRetentionPolicyEntry(text, table, column, window) {
  const lines = text.split(/\r?\n/);
  const tableCol = `\`${table}\``;
  const colName = `\`${column}\``;
  for (const line of lines) {
    if (line.includes(tableCol) && line.includes(colName) && line.includes(window)) {
      return true;
    }
  }
  return false;
}

/**
 * Check that table, column, and window co-occur in a runner entry block.
 * Searches for a contiguous group of lines containing all three fields,
 * rather than requiring them on a single line.
 */
function includesRunnerEntry(text, table, column, window) {
  const lines = text.split(/\r?\n/);
  const startPattern = /^\s*{\s*table:\s*"/;
  let entryStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startPattern.test(lines[i])) {
      if (entryStart !== -1) {
        const block = lines.slice(entryStart, i).join("\n");
        if (block.includes(`table: "${table}"`) && block.includes(`column: "${column}"`) && block.includes(`window: "${window}"`)) {
          return true;
        }
      }
      entryStart = i;
    }
  }
  if (entryStart !== -1) {
    const block = lines.slice(entryStart).join("\n");
    if (block.includes(`table: "${table}"`) && block.includes(`column: "${column}"`) && block.includes(`window: "${window}"`)) {
      return true;
    }
  }
  return false;
}

/**
 * Parse all uncommented retention runner entries from the source text.
 * Commented-out entries (lines starting with //) are excluded.
 * Returns [{ table, column, window }, ...]
 */
function parseRunnerEntries(text) {
  const entries = [];
  const lines = text.split(/\r?\n/);
  const startPattern = /^\s*{\s*table:\s*"/;

  for (let i = 0; i < lines.length; i++) {
    if (startPattern.test(lines[i])) {
      const entryLines = [];
      for (let j = i; j < lines.length; j++) {
        entryLines.push(lines[j]);
        if (lines[j].includes("}")) break;
      }

      const uncommentedLines = entryLines.filter((l) => !/^\s*\/\//.test(l));
      const block = uncommentedLines.join("\n");

      const tableMatch = block.match(/table:\s*"([^"]+)"/);
      const columnMatch = block.match(/column:\s*"([^"]+)"/);
      const windowMatch = block.match(/window:\s*"([^"]+)"/);

      if (tableMatch && columnMatch && windowMatch) {
        entries.push({ table: tableMatch[1], column: columnMatch[1], window: windowMatch[1] });
      }
    }
  }
  return entries;
}

/**
 * Validate a registry entry has the expected retention-specific fields,
 * not just a matching ID.
 */
function validateRegistryEntry(entry, expectedFields, context) {
  const errors = [];
  if (!entry) {
    errors.push(`${context}: entry not found`);
    return errors;
  }
  for (const [key, expectedValue] of Object.entries(expectedFields)) {
    const actual = entry[key];
    if (typeof expectedValue === "string") {
      if (actual !== expectedValue) {
        errors.push(`${context}: ${key} expected "${expectedValue}", got "${actual ?? "undefined"}"`);
      }
    }
  }
  return errors;
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

  // Sentinel checks: validate each critical sentinel exists in both policy and runner
  const sentinelPairs = [];
  for (const sentinel of array(contract.criticalSentinels)) {
    const { table, column, window } = sentinel ?? {};
    if (![table, column, window].every((value) => typeof value === "string" && value.length > 0)) {
      errors.push(`invalid critical sentinel: ${sentinel?.id ?? "unknown"}`);
      continue;
    }
    sentinelPairs.push(`${table}.${column}`);

    if (!includesRetentionPolicyEntry(policy, table, column, window)) {
      errors.push(`retention policy missing ${table}.${column} ${window}`);
    }
    if (!includesRunnerEntry(runner, table, column, window)) {
      errors.push(`retention runner missing ${table}.${column} ${window}`);
    }
  }

  // Defect 4: Assert distinct critical sentinel table+column pairs
  if (sentinelPairs.length !== new Set(sentinelPairs).size) {
    errors.push("critical sentinels contain duplicate table+column pairs");
  }
  for (const expectedPair of ["security_events.created_at", "foundry_run_logs.created_at"]) {
    if (!sentinelPairs.includes(expectedPair)) {
      errors.push(`critical sentinel ${expectedPair} is required but missing`);
    }
  }

  // Render cron service: identify by name field, walk block boundaries
  const scheduler = contract.scheduler ?? {};
  const cronBlock = findCronServiceBlock(render, scheduler.serviceName ?? "axtask-db-retention");
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

  if (!includesRetentionPolicyEntry(controls, "Render cron retention", "", "**On**")) {
    if (!controls.includes("Render cron retention") || !controls.includes("**On**")) {
      errors.push("docs/SCHEDULED_RESOURCE_CONTROLS.md: Render cron retention must be documented On");
    }
  }
  if (!controls.includes("In-process retention prune") || !controls.includes("**On**")) {
    warnings.push("docs/SCHEDULED_RESOURCE_CONTROLS.md: in-process retention prune is not documented On");
  }
  if (!controls.includes(contract.proof?.liveObservationMarker ?? "[retention] done. rows_deleted=")) {
    errors.push("docs/SCHEDULED_RESOURCE_CONTROLS.md: missing live retention verification marker");
  }
  if (contract.proof?.repoValidationProvesLiveExecution !== false) {
    errors.push("log retention contract must state repoValidationProvesLiveExecution=false");
  }

  // Registry wiring: validate retention-specific fields
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
    if (!array(harness?.components).some((item) => item?.id === componentId)) {
      errors.push(`.ai/harness.json: missing component ${componentId}`);
    }
  }
  if (!array(harness?.skills).includes("axtask.skill.log-retention-capacity-defense.v1")) {
    errors.push(".ai/harness.json: missing log retention skill registration");
  }
  if (!array(harness?.hookPolicy?.prePushRuns).includes("log-retention")) {
    errors.push(".ai/harness.json: prePushRuns must include log-retention");
  }

  // Workflow registry: validate path field
  const retentionWorkflow = array(workflows?.workflows).find((w) => w?.id === "axtask.log-retention-capacity-defense.v1");
  errors.push(...validateRegistryEntry(retentionWorkflow, {
    path: ".ai/workflows/log-retention-capacity-defense.md",
  }, ".ai/workflow-registry.json log-retention-capacity-defense"));

  for (const artifactId of ["log-retention-proof", "log-retention-report"]) {
    if (!array(artifacts?.artifacts).some((item) => item?.id === artifactId)) {
      errors.push(`.ai/artifact-registry.json: missing artifact ${artifactId}`);
    }
  }

  // Artifact registry: validate producer field for log-retention-proof
  const retentionProof = array(artifacts?.artifacts).find((a) => a?.id === "log-retention-proof");
  errors.push(...validateRegistryEntry(retentionProof, {
    producer: "axtask.log-retention-capacity-defense.v1",
  }, ".ai/artifact-registry.json log-retention-proof"));

  // Validator registry: validate command field
  const retentionValidator = array(validators?.validators).find((item) => item?.id === "log-retention");
  errors.push(...validateRegistryEntry(retentionValidator, {
    command: "node scripts/ai-harness/validate-log-retention.mjs",
  }, ".ai/validator-registry.json log-retention"));

  // Trigger registry: validate workflowId field
  const retentionTrigger = array(triggers?.triggers).find((item) => item?.id === "log-retention-risk");
  errors.push(...validateRegistryEntry(retentionTrigger, {
    workflowId: "axtask.log-retention-capacity-defense.v1",
  }, ".ai/trigger-registry.json log-retention-risk"));

  if (!array(map?.commands).some((c) => c?.id === "retention-harness")) {
    errors.push(".ai/codebase-map.json: missing retention-harness command");
  }
  for (const expected of ["validate-log-retention.mjs", "log-retention-harness-contract.test.ts"]) {
    if (!prePush.includes(expected)) errors.push(`.githooks/pre-push missing ${expected}`);
  }

  // Complete policy/runner set comparison: compare all contract retentionWindows
  const runnerEntries = parseRunnerEntries(runner);
  const contractWindows = array(contract.retentionWindows).map((w) => ({
    table: w.table, column: w.column, window: w.window,
  }));

  // Every contract retention window must exist in the runner
  for (const entry of contractWindows) {
    if (!runnerEntries.some((r) => r.table === entry.table && r.column === entry.column && r.window === entry.window)) {
      errors.push(`retention runner missing contract entry: ${entry.table}.${entry.column} ${entry.window}`);
    }
  }

  // Every uncommented runner entry must exist in the contract
  for (const entry of runnerEntries) {
    if (!contractWindows.some((c) => c.table === entry.table && c.column === entry.column && c.window === entry.window)) {
      errors.push(`retention runner has untracked entry: ${entry.table}.${entry.column} ${entry.window}`);
    }
  }

  return {
    contractId: contract.contractId ?? null,
    authorityRef: contract.authorityRef ?? null,
    checks: {
      sentinelChecks: sentinelPairs.length,
      repoScheduleWired: errors.every((error) => !error.startsWith("render.yaml:")),
      liveExecutionProven: false,
      liveObservationMarker: contract.proof?.liveObservationMarker ?? null,
      distinctSentinelPairs: [...new Set(sentinelPairs)],
      runnerEntryCount: runnerEntries.length,
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
