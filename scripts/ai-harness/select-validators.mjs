#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const REGISTRY_PATH = ".ai/validator-registry.json";
const RUNS_DIR = ".ai/runs";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeRepoPath(value) {
  return String(value ?? "")
    .replaceAll("\\", "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .trim();
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

export function globToRegExp(pattern) {
  const normalized = normalizeRepoPath(pattern);
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    if (char === "*") {
      if (normalized[index + 1] === "*") {
        const followedBySlash = normalized[index + 2] === "/";
        source += followedBySlash ? "(?:.*/)?" : ".*";
        index += followedBySlash ? 2 : 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += escapeRegex(char);
  }
  return new RegExp(`^${source}$`);
}

export function matchesPattern(filePath, pattern) {
  return globToRegExp(pattern).test(normalizeRepoPath(filePath));
}

function readJson(absolutePath) {
  return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(nonEmpty).map(normalizeRepoPath))].sort();
}

function discoverWorkingTreePaths(rootDir) {
  const commands = [
    ["diff", "--name-only", "--cached"],
    ["diff", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ];
  const paths = [];
  for (const args of commands) {
    try {
      const output = execFileSync("git", args, {
        cwd: rootDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      paths.push(...output.split(/\r?\n/));
    } catch {
      // A missing Git executable or non-repository root is reported by the empty-input guard.
    }
  }
  return uniqueSorted(paths);
}

function parseArgs(argv) {
  const options = {
    changedPaths: [],
    contextPath: null,
    changedFile: null,
    outputPath: null,
    workflowId: null,
    json: false,
    rootDir: DEFAULT_REPO_ROOT,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--changed" && next) {
      options.changedPaths.push(next);
      index += 1;
    } else if (arg === "--changed-file" && next) {
      options.changedFile = next;
      index += 1;
    } else if (arg === "--context" && next) {
      options.contextPath = next;
      index += 1;
    } else if (arg === "--workflow" && next) {
      options.workflowId = next;
      index += 1;
    } else if (arg === "--output" && next) {
      options.outputPath = next;
      index += 1;
    } else if (arg === "--repo-root" && next) {
      options.rootDir = path.resolve(next);
      index += 1;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/ai-harness/select-validators.mjs --changed <path> [--changed <path> ...]",
    "  node scripts/ai-harness/select-validators.mjs --context .ai/runs/<run-id>/context.json",
    "  node scripts/ai-harness/select-validators.mjs --changed-file <newline-delimited-paths>",
    "  node scripts/ai-harness/select-validators.mjs",
    "",
    "Options:",
    "  --workflow <workflow-id>  Add workflow-specific selectors.",
    "  --output <path>           Write JSON under .ai/runs/ only.",
    "  --json                    Emit JSON instead of the English plan.",
    "  --repo-root <path>        Override repository root.",
    "",
    "The selector never executes validator commands.",
  ].join("\n");
}

function collectInputs(options) {
  const changedPaths = [...options.changedPaths];
  let workflowId = options.workflowId;

  if (options.changedFile) {
    const absolutePath = path.resolve(options.rootDir, options.changedFile);
    changedPaths.push(...fs.readFileSync(absolutePath, "utf8").split(/\r?\n/));
  }

  if (options.contextPath) {
    const absolutePath = path.resolve(options.rootDir, options.contextPath);
    const context = readJson(absolutePath);
    changedPaths.push(...array(context.likelyFiles), ...array(context.collisionFiles));
    workflowId ??= context.workflowId;
  }

  if (changedPaths.length === 0) changedPaths.push(...discoverWorkingTreePaths(options.rootDir));
  return { changedPaths: uniqueSorted(changedPaths), workflowId };
}

export function ensureOutputPath(rootDir, outputPath) {
  const absoluteRoot = path.resolve(rootDir);
  const absoluteRuns = path.resolve(absoluteRoot, RUNS_DIR);
  const absoluteOutput = path.resolve(absoluteRoot, outputPath);
  const relative = path.relative(absoluteRuns, absoluteOutput);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`output must stay under ${RUNS_DIR}/`);
  }
  return absoluteOutput;
}

export function selectValidators(registry, { changedPaths, workflowId = null }) {
  const normalizedPaths = uniqueSorted(changedPaths);
  if (normalizedPaths.length === 0 && !nonEmpty(workflowId)) {
    throw new Error("no changed paths or workflow were supplied; pass --changed, --context, --changed-file, or run inside a dirty worktree");
  }

  const validators = array(registry?.validators);
  const byId = new Map(validators.map((validator) => [validator.id, validator]));
  const selected = new Map();
  const matchedPaths = new Set();

  function addValidator(id, reason) {
    const validator = byId.get(id);
    if (!validator) throw new Error(`registry references unknown validator ${id}`);
    const existing = selected.get(id) ?? { validator, reasons: [] };
    if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    selected.set(id, existing);
  }

  for (const validator of validators) {
    const selection = validator.selection ?? {};
    if (selection.always === true) addValidator(validator.id, "registry policy: always");

    if (workflowId && array(selection.workflows).includes(workflowId)) {
      addValidator(validator.id, `workflow ${workflowId}`);
    }

    for (const changedPath of normalizedPaths) {
      const patterns = array(selection.paths);
      const matchedPattern = patterns.find((pattern) => matchesPattern(changedPath, pattern));
      if (matchedPattern) {
        addValidator(validator.id, `${changedPath} matches ${matchedPattern}`);
        matchedPaths.add(changedPath);
      }
    }
  }

  const unmatchedPaths = normalizedPaths.filter((changedPath) => !matchedPaths.has(changedPath));
  if (unmatchedPaths.length > 0) {
    for (const id of array(registry?.selectionPolicy?.fallbackValidatorIds)) {
      addValidator(id, `fallback for unmatched path${unmatchedPaths.length === 1 ? "" : "s"}: ${unmatchedPaths.join(", ")}`);
    }
  }

  const pending = [...selected.keys()];
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index];
    const validator = byId.get(id);
    for (const dependencyId of array(validator?.requires)) {
      if (!selected.has(dependencyId)) pending.push(dependencyId);
      addValidator(dependencyId, `required by ${id}`);
    }
  }

  const ordered = validators
    .filter((validator) => selected.has(validator.id))
    .map((validator) => ({
      id: validator.id,
      command: validator.command,
      scope: validator.scope,
      reasons: selected.get(validator.id).reasons,
    }));

  return {
    schemaVersion: 1,
    authorityRef: registry.authorityRef,
    registryId: registry.registryId,
    workflowId: workflowId ?? null,
    changedPaths: normalizedPaths,
    unmatchedPaths,
    validators: ordered,
    executionPolicy: "selection-only; commands were not executed",
  };
}

function formatEnglish(plan) {
  const lines = [
    `Validator plan: ${plan.validators.length} selected`,
    `Workflow: ${plan.workflowId ?? "not supplied"}`,
    `Changed paths: ${plan.changedPaths.length}`,
  ];
  for (const validator of plan.validators) {
    lines.push(`- ${validator.id}: ${validator.command}`);
    for (const reason of validator.reasons) lines.push(`  reason: ${reason}`);
  }
  if (plan.unmatchedPaths.length > 0) lines.push(`Unmatched paths: ${plan.unmatchedPaths.join(", ")}`);
  lines.push("Commands were selected only; nothing was executed.");
  return lines.join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    const registry = readJson(path.join(options.rootDir, REGISTRY_PATH));
    const inputs = collectInputs(options);
    const plan = selectValidators(registry, inputs);
    const serialized = `${JSON.stringify(plan, null, 2)}\n`;
    if (options.outputPath) {
      const absoluteOutput = ensureOutputPath(options.rootDir, options.outputPath);
      fs.mkdirSync(path.dirname(absoluteOutput), { recursive: true });
      fs.writeFileSync(absoluteOutput, serialized, "utf8");
    }
    console.log(options.json ? serialized.trimEnd() : formatEnglish(plan));
  } catch (error) {
    console.error(`[validator-selection] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
