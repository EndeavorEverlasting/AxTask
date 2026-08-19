#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

function readJson(rootDir, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), "utf8"));
}

function readText(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), "utf8").trimEnd();
}

function assertRelativePath(rootDir, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new Error(`invalid repository-relative path: ${String(relativePath)}`);
  }
  const absolute = path.resolve(rootDir, relativePath);
  const rel = path.relative(rootDir, absolute);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path escapes repository root: ${relativePath}`);
  if (!fs.existsSync(absolute)) throw new Error(`missing routed path: ${relativePath}`);
  return relativePath;
}

export function estimateContext(text, bytesPerEstimatedToken = 4) {
  const bytes = Buffer.byteLength(text, "utf8");
  return { bytes, estimatedTokens: Math.ceil(bytes / bytesPerEstimatedToken) };
}

export function loadDisclosureState(rootDir = DEFAULT_REPO_ROOT) {
  const routing = readJson(rootDir, ".ai/disclosure-map.json");
  return {
    rootDir,
    routing,
    workflowRegistry: readJson(rootDir, ".ai/workflow-registry.json"),
    validatorRegistry: readJson(rootDir, ".ai/validator-registry.json"),
    artifactRegistry: readJson(rootDir, ".ai/artifact-registry.json"),
  };
}

function findUnique(items, id, label) {
  const matches = items.filter((item) => item?.id === id);
  if (matches.length !== 1) throw new Error(`${label} ${id} resolved ${matches.length} records`);
  return matches[0];
}

function validatorProjection(record) {
  return {
    id: record.id,
    command: record.command,
    scope: record.scope,
    requires: Array.isArray(record.requires) ? record.requires : [],
  };
}

function artifactProjection(record) {
  const projected = {
    id: record.id,
    pathPattern: record.pathPattern,
    tracked: record.tracked,
    sanitized: record.sanitized,
  };
  for (const key of ["validator", "schema", "template"]) if (record[key]) projected[key] = record[key];
  return projected;
}

function workflowProjection(record) {
  return { id: record.id, path: record.path, description: record.description };
}

function section(title, body) {
  return `## ${title}\n\n${body}`;
}

function fileSection(rootDir, relativePath) {
  assertRelativePath(rootDir, relativePath);
  return section(relativePath, readText(rootDir, relativePath));
}

export function renderOrientation(state) {
  const paths = state.routing?.orientation?.defaultLoadPaths ?? [];
  if (paths.length !== 1 || paths[0] !== ".ai/README.md") {
    throw new Error("orientation must load exactly .ai/README.md by default");
  }
  assertRelativePath(state.rootDir, paths[0]);
  return readText(state.rootDir, paths[0]) + "\n";
}

export function renderDomain(state, domainId) {
  const domain = findUnique(state.routing?.domains ?? [], domainId, "domain");
  assertRelativePath(state.rootDir, domain.path);
  const routeSlice = {
    id: domain.id,
    loadWhen: domain.loadWhen,
    ownerRefs: domain.ownerRefs ?? [],
    workflowIds: domain.workflowIds ?? [],
    validatorIds: domain.validatorIds ?? [],
    artifactIds: domain.artifactIds ?? [],
  };
  return [
    readText(state.rootDir, domain.path),
    section("Demand-loaded owners and workflows", JSON.stringify(routeSlice, null, 2)),
  ].join("\n\n") + "\n";
}

export function renderWorkflow(state, workflowId) {
  const routeMatches = (state.routing?.workflowRoutes ?? []).filter((item) => item?.workflowId === workflowId);
  if (routeMatches.length !== 1) throw new Error(`workflow route ${workflowId} resolved ${routeMatches.length} records`);
  const route = routeMatches[0];
  findUnique(state.routing?.domains ?? [], route.domainId, "domain");

  const workflow = findUnique(state.workflowRegistry?.workflows ?? [], workflowId, "workflow");
  assertRelativePath(state.rootDir, workflow.path);

  const validatorRecords = (route.validatorIds ?? []).map((id) =>
    validatorProjection(findUnique(state.validatorRegistry?.validators ?? [], id, "validator")),
  );
  const artifactRecords = (route.artifactIds ?? []).map((id) =>
    artifactProjection(findUnique(state.artifactRegistry?.artifacts ?? [], id, "artifact")),
  );

  const parts = [
    `# 15k workflow bundle — ${workflowId}`,
    section("Route", JSON.stringify({
      domainId: route.domainId,
      conditionalLoads: route.conditionalLoads ?? [],
    }, null, 2)),
    fileSection(state.rootDir, workflow.path),
  ];

  for (const skillPath of route.skillPaths ?? []) parts.push(fileSection(state.rootDir, skillPath));
  for (const contractPath of route.contractPaths ?? []) parts.push(fileSection(state.rootDir, contractPath));
  for (const schemaPath of route.schemaPaths ?? []) parts.push(fileSection(state.rootDir, schemaPath));

  const failurePath = state.routing?.sharedWorkflowContracts?.failurePolicy;
  const handoffPath = state.routing?.sharedWorkflowContracts?.handoff;
  parts.push(fileSection(state.rootDir, failurePath));
  parts.push(fileSection(state.rootDir, handoffPath));

  parts.push(section("Workflow registry slice", JSON.stringify(workflowProjection(workflow), null, 2)));
  parts.push(section("Validator registry slice", JSON.stringify(validatorRecords, null, 2)));
  parts.push(section("Artifact registry slice", JSON.stringify(artifactRecords, null, 2)));

  return parts.join("\n\n") + "\n";
}

export function renderRequestedContext(kind, id, rootDir = DEFAULT_REPO_ROOT) {
  const state = loadDisclosureState(rootDir);
  if (kind === "orientation") return renderOrientation(state);
  if (kind === "domain") {
    if (!id) throw new Error("domain id is required");
    return renderDomain(state, id);
  }
  if (kind === "workflow") {
    if (!id) throw new Error("workflow id is required");
    return renderWorkflow(state, id);
  }
  throw new Error(`unknown context kind: ${kind}`);
}

function main() {
  const args = process.argv.slice(2);
  const measureOnly = args.includes("--measure");
  const positional = args.filter((arg) => arg !== "--measure");
  const [kind = "orientation", id] = positional;
  try {
    const rendered = renderRequestedContext(kind, id);
    if (measureOnly) {
      const estimate = estimateContext(rendered);
      process.stdout.write(`${JSON.stringify({ kind, id: id ?? null, ...estimate, estimator: "UTF-8 bytes/4" })}\n`);
      return;
    }
    process.stdout.write(rendered);
  } catch (error) {
    console.error(`[show-context] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
