#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TOKENIZER_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const REGISTRY_PATH = ".ai/tokenizer-registry.json";

function readRegistry(rootDir) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, REGISTRY_PATH), "utf8"));
}

function uniqueById(records, id, label) {
  const matches = (Array.isArray(records) ? records : []).filter((record) => record?.id === id);
  if (matches.length !== 1) throw new Error(`${label} ${id} resolved ${matches.length} records`);
  return matches[0];
}

function repositoryPath(rootDir, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`invalid tokenizer runner path: ${String(relativePath)}`);
  }
  const root = fs.realpathSync(path.resolve(rootDir));
  const target = fs.realpathSync(path.resolve(rootDir, relativePath));
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`tokenizer runner escapes repository root: ${relativePath}`);
  return target;
}

function pythonCandidates() {
  const configured = process.env.AXTASK_TOKENIZER_PYTHON;
  const candidates = [];
  if (configured) candidates.push({ command: configured, args: [] });
  candidates.push({ command: "python3", args: [] }, { command: "python", args: [] });
  if (process.platform === "win32") candidates.push({ command: "py", args: ["-3"] });
  return candidates;
}

function runPythonBackend(runner, request, installHint) {
  let foundRuntime = false;
  for (const candidate of pythonCandidates()) {
    const result = spawnSync(candidate.command, [...candidate.args, runner], {
      input: JSON.stringify(request),
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    if (result.error?.code === "ENOENT") continue;
    foundRuntime = true;
    if (result.status !== 0) continue;
    try {
      return JSON.parse(result.stdout);
    } catch {
      throw new Error("tokenizer backend returned invalid JSON");
    }
  }
  if (!foundRuntime) throw new Error(`Python 3 is required for exact tokenization; ${installHint}`);
  throw new Error(`exact tokenizer backend failed closed; ${installHint}`);
}

export function loadTokenizerContract(rootDir = DEFAULT_TOKENIZER_ROOT, profileId) {
  const registry = readRegistry(rootDir);
  if (registry.schemaVersion !== 1 || registry.registryId !== "axtask.tokenizer-registry.v1") {
    throw new Error("unsupported tokenizer registry contract");
  }
  const selectedId = profileId ?? registry.defaultContextProfileId;
  const profile = uniqueById(registry.profiles, selectedId, "tokenizer profile");
  const backend = uniqueById(registry.backends, profile.backendId, "tokenizer backend");
  return { registry, profile, backend };
}

export function measureContext(text, options = {}) {
  if (typeof text !== "string") throw new Error("context text must be a string");
  const rootDir = options.rootDir ?? DEFAULT_TOKENIZER_ROOT;
  const { profile, backend } = loadTokenizerContract(rootDir, options.profileId);
  if (profile.measurement !== "exact-tokenization") throw new Error(`profile ${profile.id} is not exact-tokenization`);
  if (backend.id !== "openai-tiktoken" || backend.status !== "active-context-counting") {
    throw new Error(`profile ${profile.id} does not resolve to the active OpenAI counting backend`);
  }
  if (backend.package?.name !== "tiktoken" || typeof backend.package?.version !== "string") {
    throw new Error("OpenAI tokenizer backend must pin the tiktoken package version");
  }
  const runner = repositoryPath(rootDir, backend.runner);
  const result = runPythonBackend(runner, {
    text,
    encoding: profile.encoding,
    expectedVersion: backend.package.version,
  }, `run: python -m pip install -r scripts/ai-harness/tokenizer-requirements.txt`);
  if (result?.ok !== true || !Number.isInteger(result.tokens) || result.tokens < 0) {
    throw new Error("tokenizer backend returned an invalid token count");
  }
  if (result.backend !== backend.repository || result.encoding !== profile.encoding || result.version !== backend.package.version) {
    throw new Error("tokenizer backend identity does not match the registry contract");
  }
  return {
    bytes: Buffer.byteLength(text, "utf8"),
    tokens: result.tokens,
    measurement: profile.measurement,
    profileId: profile.id,
    backend: result.backend,
    backendVersion: result.version,
    encoding: result.encoding,
  };
}
