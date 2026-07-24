#!/usr/bin/env node
/**
 * Cross-Surface Contract Impact Inspector
 *
 * Maps changed contract files to dependent active surfaces and required validators
 * according to .ai/contract-impact-registry.json.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function normalizePath(p) {
  return p.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
}

function globToRegex(glob) {
  const reStr = glob
    .replace(/\\/g, "/")
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${reStr}$`, "i");
}

function matchesPath(filePath, pattern) {
  const normFile = normalizePath(filePath);
  const normPattern = normalizePath(pattern);

  if (normPattern.includes("*")) {
    const re = globToRegex(pattern);
    return re.test(normFile);
  }
  return normFile === normPattern || normFile.startsWith(normPattern + "/");
}

function loadRegistry() {
  const regPath = path.join(root, ".ai", "contract-impact-registry.json");
  if (!existsSync(regPath)) {
    throw new Error(`[contract-impact] Registry missing at ${regPath}`);
  }
  try {
    return JSON.parse(readFileSync(regPath, "utf8"));
  } catch (err) {
    throw new Error(`[contract-impact] Malformed registry at ${regPath}: ${err.message}`);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const changed = [];
  let jsonOutput = false;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--changed" && i + 1 < args.length) {
      changed.push(args[++i]);
    } else if (arg.startsWith("--changed=")) {
      changed.push(arg.slice(10));
    } else if (arg === "--json") {
      jsonOutput = true;
    } else if (arg === "--output" && i + 1 < args.length) {
      outputPath = args[++i];
    } else if (arg.startsWith("--output=")) {
      outputPath = arg.slice(9);
    }
  }

  return { changed, jsonOutput, outputPath };
}

export function inspectContractImpact(changedPaths = []) {
  const registry = loadRegistry();
  const normChanged = changedPaths.map(normalizePath);

  const matchedDomains = [];
  const allDependentSurfaces = new Set();
  const allValidators = new Set();

  for (const domain of registry.domains) {
    let isSourceMatched = false;
    let isDependentMatched = false;
    const matchedSourcePaths = [];

    for (const cp of changedPaths) {
      for (const sp of domain.sourcePaths) {
        if (matchesPath(cp, sp)) {
          isSourceMatched = true;
          matchedSourcePaths.push(cp);
        }
      }
      for (const dp of domain.dependentSurfaces) {
        if (matchesPath(cp, dp)) {
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
        dependentSurfaces: domain.dependentSurfaces,
        validators: domain.validators,
        proofCeiling: domain.proofCeiling,
      });

      for (const ds of domain.dependentSurfaces) {
        allDependentSurfaces.add(ds);
      }
      for (const val of domain.validators) {
        allValidators.add(val);
      }
    }
  }

  return {
    schemaVersion: 1,
    authorityRef: registry.authorityRef,
    registryId: registry.registryId,
    generatedAt: new Date().toISOString(),
    changedPaths,
    matchedDomains,
    dependentSurfaces: Array.from(allDependentSurfaces),
    selectedValidators: Array.from(allValidators),
  };
}

function main() {
  const { changed, jsonOutput, outputPath } = parseArgs();
  const result = inspectContractImpact(changed);

  if (outputPath) {
    const normOut = path.normalize(outputPath);
    const runsDir = path.normalize(path.join(root, ".ai", "runs"));
    if (!normOut.startsWith(runsDir)) {
      console.error(`[contract-impact] ERROR: Output path must be under .ai/runs/. Provided: ${outputPath}`);
      process.exit(1);
    }
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(result, null, 2) + "\n");
  }

  if (jsonOutput) {
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
}

if (process.argv[1] && normalizePath(process.argv[1]).endsWith("inspect-contract-impact.mjs")) {
  main();
}
