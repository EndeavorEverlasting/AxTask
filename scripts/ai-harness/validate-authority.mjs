#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const DEFAULT_MANIFEST_PATH = ".ai/authority.json";

function readText(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listFilesRecursive(rootDir, relativeRoot) {
  const absoluteRoot = path.join(rootDir, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];

  const files = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolutePath);
      } else if (entry.isFile()) {
        files.push(normalizePath(path.relative(rootDir, absolutePath)));
      }
    }
  }
  return files.sort();
}

function parseAuthorityRef(relativePath, text, fieldName) {
  const extension = path.extname(relativePath).toLowerCase();
  if (extension === ".json") {
    try {
      const parsed = JSON.parse(text);
      return parsed?.[fieldName] ?? null;
    } catch (error) {
      return {
        parseError: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const pattern = new RegExp(
    `(?:^|\\n)\\s*${escapeRegExp(fieldName)}\\s*:\\s*["']?([^"'\\s]+)`,
  );
  return text.match(pattern)?.[1] ?? null;
}

export function validateHarnessArtifact(relativePath, text, contract) {
  const errors = [];
  const parsedRef = parseAuthorityRef(
    relativePath,
    text,
    contract.authorityRefField,
  );

  if (parsedRef && typeof parsedRef === "object" && "parseError" in parsedRef) {
    errors.push(`${relativePath}: invalid JSON: ${parsedRef.parseError}`);
  } else if (parsedRef !== contract.requiredAuthorityRef) {
    errors.push(
      `${relativePath}: expected ${contract.authorityRefField}=${contract.requiredAuthorityRef}`,
    );
  }

  for (const heading of contract.forbiddenEmbeddedHeadings ?? []) {
    if (text.includes(heading)) {
      errors.push(
        `${relativePath}: copies canonical authority heading ${JSON.stringify(heading)}`,
      );
    }
  }

  for (const statement of contract.forbiddenStaleStatements ?? []) {
    if (text.includes(statement)) {
      errors.push(`${relativePath}: contains a forbidden stale statement`);
    }
  }

  return errors;
}

export function validateAuthorityManifest(rootDir, manifest) {
  const errors = [];

  if (manifest.schemaVersion !== 1) {
    errors.push("authority.json: schemaVersion must equal 1");
  }
  if (manifest.authorityId !== "axtask.agent-authority.v1") {
    errors.push("authority.json: authorityId must equal axtask.agent-authority.v1");
  }
  if (manifest.entryPoint !== "AGENTS.md") {
    errors.push("authority.json: entryPoint must equal AGENTS.md");
  }

  const orderedSources = Array.isArray(manifest.orderedSources)
    ? manifest.orderedSources
    : [];
  if (orderedSources.length === 0) {
    errors.push("authority.json: orderedSources must not be empty");
  }

  const ids = new Set();
  const ranks = new Set();
  for (const source of orderedSources) {
    if (!source || typeof source !== "object") {
      errors.push("authority.json: every ordered source must be an object");
      continue;
    }
    if (ids.has(source.id)) {
      errors.push(`authority.json: duplicate source id ${source.id}`);
    }
    ids.add(source.id);
    if (ranks.has(source.rank)) {
      errors.push(`authority.json: duplicate rank ${source.rank}`);
    }
    ranks.add(source.rank);

    const paths = Array.isArray(source.paths) ? source.paths : [];
    if (paths.length === 0) {
      errors.push(`authority.json: source ${source.id} has no paths`);
    }
    if (source.role === "non-authoritative-history") continue;
    for (const relativePath of paths) {
      if (!fs.existsSync(path.join(rootDir, relativePath))) {
        errors.push(`authority.json: missing referenced path ${relativePath}`);
      }
    }
  }

  const sortedRanks = [...ranks].sort((a, b) => a - b);
  for (let index = 0; index < sortedRanks.length; index += 1) {
    if (sortedRanks[index] !== index + 1) {
      errors.push("authority.json: ranks must be contiguous and start at 1");
      break;
    }
  }

  const requiredAnchors = manifest.requiredAnchors ?? {};
  for (const [relativePath, anchors] of Object.entries(requiredAnchors)) {
    const absolutePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      errors.push(`authority.json: anchor file is missing: ${relativePath}`);
      continue;
    }
    const text = readText(rootDir, relativePath);
    for (const anchor of anchors) {
      if (!text.includes(anchor)) {
        errors.push(
          `authority.json: ${relativePath} is missing required anchor ${JSON.stringify(anchor)}`,
        );
      }
    }
  }

  const contract = manifest.harnessContract;
  if (!contract || typeof contract !== "object") {
    errors.push("authority.json: harnessContract is required");
    return errors;
  }
  if (contract.requiredAuthorityRef !== manifest.authorityId) {
    errors.push(
      "authority.json: harnessContract.requiredAuthorityRef must match authorityId",
    );
  }

  return errors;
}

export function validateAuthorityContract(
  rootDir = DEFAULT_REPO_ROOT,
  manifestPath = DEFAULT_MANIFEST_PATH,
) {
  const errors = [];
  const absoluteManifestPath = path.join(rootDir, manifestPath);
  if (!fs.existsSync(absoluteManifestPath)) {
    return {
      authorityId: null,
      filesChecked: 0,
      errors: [`missing authority manifest: ${manifestPath}`],
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(absoluteManifestPath, "utf8"));
  } catch (error) {
    return {
      authorityId: null,
      filesChecked: 0,
      errors: [
        `invalid authority manifest: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }

  errors.push(...validateAuthorityManifest(rootDir, manifest));

  const contract = manifest.harnessContract ?? {};
  const allowedExtensions = new Set(contract.manifestExtensions ?? []);
  const artifactFiles = (contract.manifestRoots ?? []).flatMap((relativeRoot) =>
    listFilesRecursive(rootDir, relativeRoot),
  );
  const checkedFiles = artifactFiles.filter((relativePath) =>
    allowedExtensions.has(path.extname(relativePath).toLowerCase()),
  );

  for (const relativePath of checkedFiles) {
    const text = readText(rootDir, relativePath);
    errors.push(...validateHarnessArtifact(relativePath, text, contract));
  }

  return {
    authorityId: manifest.authorityId ?? null,
    filesChecked: checkedFiles.length,
    errors,
  };
}

function main() {
  const rootDir = process.argv[2]
    ? path.resolve(process.argv[2])
    : DEFAULT_REPO_ROOT;
  const result = validateAuthorityContract(rootDir);
  if (result.errors.length > 0) {
    console.error(
      `[ai-authority] FAIL authority=${result.authorityId ?? "unknown"} artifacts=${result.filesChecked}`,
    );
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `[ai-authority] PASS authority=${result.authorityId} artifacts=${result.filesChecked}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
