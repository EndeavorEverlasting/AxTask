#!/usr/bin/env node
/**
 * CI guard for production startup safety.
 *
 * Objective:
 * - The app may run SQL migrations during production startup.
 * - The app must not run Drizzle schema push during production startup unless an explicit operator override is present.
 * - Render/Docker startup paths must converge through scripts/production-start.mjs.
 *
 * This script fails PR/push checks with GitHub annotations when startup paths drift.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

const errors = [];
const warnings = [];
const passes = [];

function read(rel) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`${rel} is missing.`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

function pass(message) {
  passes.push(message);
}

function warn(message) {
  warnings.push(message);
}

function fail(message) {
  errors.push(message);
}

function contains(content, needle) {
  return content.includes(needle);
}

function hasRegex(content, regex) {
  return regex.test(content);
}

const pkg = JSON.parse(read("package.json") || "{}");
const productionStart = read("scripts/production-start.mjs");
const dockerfile = read("Dockerfile");
const renderYaml = read("render.yaml");

const startScript = pkg.scripts?.start || "";
if (hasRegex(startScript, /production-start\.mjs/)) {
  pass("package.json start script routes through scripts/production-start.mjs.");
} else {
  fail(`package.json start script must route through scripts/production-start.mjs. Current: ${JSON.stringify(startScript)}`);
}

const requiredProductionStartTokens = [
  "SKIP_DB_PUSH_ON_START",
  "AXTASK_ALLOW_DB_PUSH_ON_START",
  "runningOnRender",
  "nonInteractive",
  "shouldSkipDbPush",
  "drizzle-kit",
  "push",
];
for (const token of requiredProductionStartTokens) {
  if (contains(productionStart, token)) {
    pass(`production-start contains ${token}.`);
  } else {
    fail(`scripts/production-start.mjs is missing required guard token: ${token}`);
  }
}

if (hasRegex(productionStart, /if \(shouldSkipDbPush\)/)) {
  pass("production-start gates Drizzle push behind shouldSkipDbPush.");
} else {
  fail("scripts/production-start.mjs must gate Drizzle push behind shouldSkipDbPush.");
}

if (hasRegex(dockerfile, /CMD\s+\["node",\s*"scripts\/production-start\.mjs"\]/)) {
  pass("Dockerfile runtime uses scripts/production-start.mjs.");
} else {
  fail("Dockerfile runtime must use CMD [\"node\", \"scripts/production-start.mjs\"] to avoid split startup behavior.");
}

if (hasRegex(dockerfile, /drizzle-kit\s+push|npx\s+drizzle-kit/)) {
  fail("Dockerfile must not invoke drizzle-kit push directly. Route through scripts/production-start.mjs only.");
} else {
  pass("Dockerfile does not invoke drizzle-kit directly.");
}

if (hasRegex(renderYaml, /startCommand:\s*npm\s+run\s+start/)) {
  pass("render.yaml startCommand uses npm run start.");
} else {
  fail("render.yaml startCommand must use npm run start so production-start.mjs is the Render entrypoint.");
}

if (contains(renderYaml, "SKIP_DB_PUSH_ON_START") && hasRegex(renderYaml, /value:\s*["']true["']/)) {
  pass("render.yaml codifies SKIP_DB_PUSH_ON_START=true.");
} else {
  fail("render.yaml must define SKIP_DB_PUSH_ON_START=true for production startup safety.");
}

if (hasRegex(renderYaml, /drizzle-kit\s+push|npx\s+drizzle-kit/)) {
  fail("render.yaml must not invoke drizzle-kit push directly.");
} else {
  pass("render.yaml does not invoke drizzle-kit directly.");
}

if (contains(renderYaml, "healthCheckPath: /health")) {
  pass("render.yaml healthCheckPath is /health (cheap liveness).");
} else if (contains(renderYaml, "healthCheckPath: /ready")) {
  warn("render.yaml uses /ready as healthCheckPath — every check hits the DB. Prefer /health for Render.");
} else {
  fail("render.yaml must declare healthCheckPath (/health recommended).");
}

if (!contains(productionStart, "apply-migrations.mjs")) {
  fail("production-start must keep versioned SQL migrations in the startup path.");
} else {
  pass("production-start keeps versioned SQL migrations in the startup path.");
}

function emitGitHubAnnotation(kind, message) {
  const command = kind === "error" ? "error" : "warning";
  const escaped = message.replaceAll("%", "%25").replaceAll("\n", "%0A").replaceAll("\r", "%0D");
  console.log(`::${command} title=Production startup guard::${escaped}`);
}

for (const message of warnings) emitGitHubAnnotation("warning", message);
for (const message of errors) emitGitHubAnnotation("error", message);

const reportLines = [
  "# Production startup guard",
  "",
  `Result: ${errors.length === 0 ? "PASS" : "FAIL"}`,
  "",
  "## Passes",
  ...passes.map((m) => `- ${m}`),
  "",
  "## Warnings",
  ...(warnings.length ? warnings.map((m) => `- ${m}`) : ["- None"]),
  "",
  "## Errors",
  ...(errors.length ? errors.map((m) => `- ${m}`) : ["- None"]),
  "",
  "## Policy",
  "- App startup may run deterministic SQL migrations.",
  "- App startup must not run live Drizzle schema push by default.",
  "- Docker, Render, and npm startup paths must converge through scripts/production-start.mjs.",
];

const report = `${reportLines.join("\n")}\n`;
console.log(report);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}

if (errors.length > 0) {
  process.exit(1);
}
