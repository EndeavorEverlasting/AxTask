#!/usr/bin/env node
/**
 * Cross-Surface Contract Impact Inspector
 *
 * Maps changed contract files to dependent active surfaces and required validators
 * according to .ai/contract-impact-registry.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const RUNS_DIR = ".ai/runs";
const REGISTRY_RELATIVE_PATH = ".ai/contract-impact-registry.json";

function normalizeRepoPath(value) {
  return String(value ?? "")
    .replace(/\\/g, "/")
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
  return new RegExp(`^${source}$`, "i");
}

export function matchesPattern(filePath, pattern) {
  const normFile = normalizeRepoPath(filePath);
  const normPattern = normalizeRepoPath(pattern);
  if (normPattern.includes("*") || normPattern.includes("?")) {
    return globToRegExp(pattern).test(normFile);
  }
  return normFile === normPattern || normFile.startsWith(normPattern + "/");
}

function loadRegistry(rootDir = DEFAULT_REPO_ROOT) {
  const regPath = path.resolve(rootDir, REGISTRY_RELATIVE_PATH);
  if (!fs.existsSync(regPath)) {
    throw new Error(`[contract-impact] Registry missing at ${regPath}`);
  }
  try {
    const content = fs.readFileSync(regPath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`[contract-impact] Malformed registry at ${regPath}: ${err.message}`);
  }
}

export function ensureOutputPath(rootDir, outputPath) {
  const absoluteRoot = path.resolve(rootDir);
  const absoluteRuns = path.resolve(absoluteRoot, RUNS_DIR);
  const absoluteOutput = path.resolve(absoluteRoot, outputPath);

  const lexicalRelative = path.relative(absoluteRuns, absoluteOutput);
  if (lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative) || lexicalRelative === "") {
    throw new Error(`output must stay under ${RUNS_DIR}/`);
  }

  if (!fs.existsSync(absoluteRuns)) {
    fs.mkdirSync(absoluteRuns, { recursive: true });
  }

  const resolvedRuns = fs.realpathSync(absoluteRuns, { encoding: "utf8" });

  if (fs.existsSync(absoluteOutput)) {
    const stat = fs.lstatSync(absoluteOutput);
    if (stat.isSymbolicLink()) {
      throw new Error(`output must stay under ${RUNS_DIR}/`);
    }
  }

  const outputParent = path.dirname(absoluteOutput);

  let curr = outputParent;
  const dirsToVerify = [];
  while (curr !== absoluteRuns && curr.startsWith(absoluteRuns)) {
    dirsToVerify.push(curr);
    curr = path.dirname(curr);
  }
  dirsToVerify.reverse();

  for (const dir of dirsToVerify) {
    if (fs.existsSync(dir)) {
      const stat = fs.lstatSync(dir);
      if (stat.isSymbolicLink()) {
        throw new Error(`output must stay under ${RUNS_DIR}/`);
      }
    }
  }

  fs.mkdirSync(outputParent, { recursive: true });

  const resolvedOutputParent = fs.realpathSync(outputParent, { encoding: "utf8" });
  const relative = path.relative(resolvedRuns, resolvedOutputParent);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`output must stay under ${RUNS_DIR}/`);
  }

  return absoluteOutput;
}

function parseArgs(argv) {
  const options = {
    changedPaths: [],
    contextPath: null,
    changedFile: null,
    outputPath: null,
    jsonOutput: false,
    rootDir: DEFAULT_REPO_ROOT,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--changed" && next) {
      options.changedPaths.push(next);
      i++;
    } else if (arg.startsWith("--changed=")) {
      options.changedPaths.push(arg.slice(10));
    } else if (arg === "--changed-file" && next) {
      options.changedFile = next;
      i++;
    } else if (arg.startsWith("--changed-file=")) {
      options.changedFile = arg.slice(15);
    } else if (arg === "--context" && next) {
      options.contextPath = next;
      i++;
    } else if (arg.startsWith("--context=")) {
      options.contextPath = arg.slice(10);
    } else if (arg === "--repo-root" && next) {
      options.rootDir = path.resolve(next);
      i++;
    } else if (arg.startsWith("--repo-root=")) {
      options.rootDir = path.resolve(arg.slice(12));
    } else if (arg === "--output" && next) {
      options.outputPath = next;
      i++;
    } else if (arg.startsWith("--output=")) {
      options.outputPath = arg.slice(9);
    } else if (arg === "--json") {
      options.jsonOutput = true;
    } else if (arg === "--help" || arg === "-h") {
      options.help = true;
    }
  }

  return options;
}

function collectInputs(options) {
  const changedPaths = [...options.changedPaths];

  if (options.changedFile) {
    const absFile = path.resolve(options.rootDir, options.changedFile);
    const content = fs.readFileSync(absFile, "utf8");
    changedPaths.push(...content.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  }

  if (options.contextPath) {
    const absCtx = path.resolve(options.rootDir, options.contextPath);
    const ctx = JSON.parse(fs.readFileSync(absCtx, "utf8"));
    if (Array.isArray(ctx.likelyFiles)) changedPaths.push(...ctx.likelyFiles);
    if (Array.isArray(ctx.collisionFiles)) changedPaths.push(...ctx.collisionFiles);
  }

  return [...new Set(changedPaths.map(normalizeRepoPath))];
}

export function inspectContractImpact(changedPaths = [], options = {}) {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : DEFAULT_REPO_ROOT;
  const registry = options.registry ?? loadRegistry(rootDir);
  const normChanged = changedPaths.map(normalizeRepoPath);

  const matchedDomains = [];
  const allDependentSurfaces = new Set();
  const allValidators = new Set();

  for (const domain of registry.domains ?? []) {
    let isSourceMatched = false;
    let isDependentMatched = false;
    const matchedSourcePaths = [];

    for (const cp of normChanged) {
      for (const sp of domain.sourcePaths ?? []) {
        if (matchesPattern(cp, sp)) {
          isSourceMatched = true;
          if (!matchedSourcePaths.includes(cp)) matchedSourcePaths.push(cp);
        }
      }
      for (const dp of domain.dependentSurfaces ?? []) {
        if (matchesPattern(cp, dp)) {
          isDependentMatched = true;
        }
      }
    }

    if (isSourceMatched || isDependentMatched) {
      matchedDomains.push({
        id: domain.id,
        name: domain.name,
        canonicalOwner: domain.canonicalOwner,
        matchedSourcePaths,
        dependentSurfaces: domain.dependentSurfaces ?? [],
        validators: domain.validators ?? [],
        proofCeiling: domain.proofCeiling,
      });

      for (const ds of domain.dependentSurfaces ?? []) {
        allDependentSurfaces.add(ds);
      }
      for (const val of domain.validators ?? []) {
        allValidators.add(val);
      }
    }
  }

  return {
    schemaVersion: 1,
    authorityRef: registry.authorityRef,
    registryId: registry.registryId,
    generatedAt: new Date().toISOString(),
    changedPaths: normChanged,
    matchedDomains,
    dependentSurfaces: Array.from(allDependentSurfaces),
    selectedValidators: Array.from(allValidators),
  };
}

function usage() {
  return [
    "Usage:",
    "  node scripts/ai-harness/inspect-contract-impact.mjs --changed <path> [--changed <path> ...]",
    "  node scripts/ai-harness/inspect-contract-impact.mjs --context .ai/runs/<run-id>/context.json",
    "  node scripts/ai-harness/inspect-contract-impact.mjs --changed-file <path>",
    "",
    "Options:",
    "  --repo-root <path>  Override repository root.",
    "  --output <path>     Write JSON under .ai/runs/ only.",
    "  --json              Emit JSON output.",
  ].join("\n");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }

    const changedPaths = collectInputs(options);
    const result = inspectContractImpact(changedPaths, { rootDir: options.rootDir });

    if (options.outputPath) {
      const absOutput = ensureOutputPath(options.rootDir, options.outputPath);
      fs.mkdirSync(path.dirname(absOutput), { recursive: true });
      fs.writeFileSync(absOutput, JSON.stringify(result, null, 2) + "\n", "utf8");
    }

    if (options.jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("=== Cross-Surface Contract Impact Ledger ===");
      console.log(`Inspected At: ${result.generatedAt}`);
      console.log(`Changed Paths (${result.changedPaths.length}): ${result.changedPaths.join(", ") || "(None)"}`);
      console.log(`Matched Domains (${result.matchedDomains.length}):`);
      for (const d of result.matchedDomains) {
        console.log(`  - [${d.id}] ${d.name} (Owner: ${d.canonicalOwner})`);
        console.log(`    Dependents: ${d.dependentSurfaces.join(", ")}`);
        console.log(`    Validators: ${d.validators.join(", ")}`);
      }
      console.log(`Dependent Active Surfaces: ${result.dependentSurfaces.join(", ") || "(None)"}`);
      console.log(`Selected Impact Validators: ${result.selectedValidators.join(", ") || "(None)"}`);
    }
  } catch (error) {
    console.error(`[contract-impact] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
