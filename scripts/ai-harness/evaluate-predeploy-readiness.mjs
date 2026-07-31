#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const runsRoot = path.join(repoRoot, ".ai", "runs");

const RUNTIME_PATTERNS = [
  /^client\//,
  /^server\//,
  /^shared\//,
  /^migrations\//,
  /^render\.yaml$/,
  /^Dockerfile$/,
  /^package(?:-lock)?\.json$/,
  /^scripts\/production-start\.mjs$/,
  /^scripts\/deploy\//,
  /^scripts\/db\//,
];

const SCHEMA_PATTERNS = [
  /^migrations\//,
  /^shared\/schema(?:\.ts|\/)/,
  /^drizzle\.config\.ts$/,
  /^scripts\/apply-migrations\.mjs$/,
  /^scripts\/migration-airlock\.mjs$/,
];

const DEPLOYMENT_PATTERNS = [
  /^render\.yaml$/,
  /^Dockerfile$/,
  /^scripts\/production-start\.mjs$/,
  /^scripts\/deploy\//,
];

function normalizePath(value) {
  return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "").trim();
}

function anyMatch(file, patterns) {
  return patterns.some((pattern) => pattern.test(file));
}

export function classifyChangedPaths(changedPaths = []) {
  const files = [...new Set(changedPaths.map(normalizePath).filter(Boolean))];
  const runtimeAffecting = files.filter((file) => anyMatch(file, RUNTIME_PATTERNS));
  const schemaAffecting = files.filter((file) => anyMatch(file, SCHEMA_PATTERNS));
  const deploymentConfigAffecting = files.filter((file) => anyMatch(file, DEPLOYMENT_PATTERNS));
  const docsOrHarnessOnly = files.length > 0 && runtimeAffecting.length === 0;
  return {
    files,
    runtimeAffecting,
    schemaAffecting,
    deploymentConfigAffecting,
    docsOrHarnessOnly,
    deploymentNeeded: runtimeAffecting.length > 0,
  };
}

function gate(name, ok, owner, command, reason) {
  return { name, ok, owner, command, reason };
}

export function evaluatePredeployReadiness(input) {
  const impact = classifyChangedPaths(input.changedPaths ?? []);
  const sameCandidate = Boolean(input.currentMainSha) && input.currentMainSha === input.candidateSha;

  const gates = [
    gate(
      "repository-clean",
      input.repositoryClean === true,
      "repository-owner",
      "git status --short",
      "Working tree must be clean before release convergence.",
    ),
    gate(
      "no-blocking-prs",
      Number(input.blockingPrCount ?? 0) === 0,
      "repository-owner",
      "gh pr list --state open",
      "Open blocking PRs must be merged, closed, or explicitly quarantined outside the release floor.",
    ),
    gate(
      "candidate-current",
      sameCandidate,
      "repository-owner",
      "git fetch origin --prune --no-tags; git rev-parse HEAD; git rev-parse origin/main",
      "The evaluated candidate must equal current main.",
    ),
    gate(
      "required-ci",
      input.ciGreen === true,
      "ci-owner",
      "gh pr checks --required",
      "Required repository CI must be green on the exact candidate.",
    ),
  ];

  if (impact.deploymentNeeded) {
    gates.push(
      gate(
        "account-backup-roundtrip",
        input.backupStatus === "PASS_ACCOUNT_ROUNDTRIP",
        "backup-certification",
        "node scripts/db/run-local-account-backup-cert.mjs",
        "Runtime-affecting deployment candidates require current disposable account recovery proof.",
      ),
      gate(
        "schema-safety",
        impact.schemaAffecting.length > 0 ? input.schemaStatus === "PASS" : input.schemaStatus !== "FAIL",
        "database-airlock",
        "npm run test:deploy:migrations",
        "Schema-affecting candidates must pass migration safety; other candidates may record NOT_REQUIRED.",
      ),
      gate(
        "production-build",
        input.buildStatus === "PASS",
        "build-owner",
        "npm run build",
        "Runtime-affecting candidates require a successful production build.",
      ),
    );
  }

  const failed = gates.filter((item) => !item.ok);
  let verdict;
  let recommendation;

  if (failed.some((item) => ["repository-clean", "no-blocking-prs", "candidate-current", "required-ci", "production-build"].includes(item.name))) {
    verdict = "NOT_READY_REPOSITORY";
    recommendation = "REPAIR_REPOSITORY_GATE";
  } else if (failed.some((item) => item.name === "account-backup-roundtrip")) {
    verdict = "NOT_READY_BACKUP";
    recommendation = "RUN_BACKUP_CERTIFICATION";
  } else if (failed.some((item) => item.name === "schema-safety")) {
    verdict = "NOT_READY_SCHEMA";
    recommendation = "REPAIR_SCHEMA_GATE";
  } else if (!impact.deploymentNeeded) {
    verdict = "READY_FOR_LOCAL_ACCEPTANCE";
    recommendation = "NO_DEPLOY_NEEDED";
  } else if (input.runtimeStatus === "FAIL") {
    verdict = "NOT_READY_RUNTIME";
    recommendation = "REPAIR_LOCAL_RUNTIME";
  } else if (input.runtimeStatus === "PASS") {
    verdict = "READY_FOR_AUTHORIZED_DEPLOYMENT";
    recommendation = "AWAIT_EXPLICIT_DEPLOYMENT_AUTHORIZATION";
  } else {
    verdict = "READY_FOR_LOCAL_ACCEPTANCE";
    recommendation = "RUN_LOCAL_PRODUCTION_CERTIFICATION";
  }

  const costExposure = !impact.deploymentNeeded
    ? "NONE_NO_DEPLOY_NEEDED"
    : impact.deploymentConfigAffecting.length > 0 || impact.schemaAffecting.length > 0
      ? "PROVIDER_AND_DATABASE_RUNTIME_EXPOSURE"
      : "APPLICATION_RUNTIME_EXPOSURE";

  return {
    schemaVersion: 1,
    authorityRef: "axtask.agent-authority.v1",
    generatedAt: new Date().toISOString(),
    currentMainSha: input.currentMainSha ?? null,
    candidateSha: input.candidateSha ?? null,
    deploymentNeeded: impact.deploymentNeeded,
    runtimeImpact: impact,
    costEvidence: {
      classification: costExposure,
      monetaryEstimate: null,
      note: "No provider pricing is inferred. Cost exposure is qualitative unless separately sourced.",
    },
    gates,
    missingGates: failed.map(({ name, owner, command, reason }) => ({ name, owner, command, reason })),
    verdict,
    recommendation,
    proofCeiling: "repository-evidence",
  };
}

function parseArgs(argv) {
  const options = { input: null, output: null, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input" && argv[i + 1]) options.input = argv[++i];
    else if (arg.startsWith("--input=")) options.input = arg.slice(8);
    else if (arg === "--output" && argv[i + 1]) options.output = argv[++i];
    else if (arg.startsWith("--output=")) options.output = arg.slice(9);
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
  }
  return options;
}

function usage() {
  return [
    "Usage:",
    "  node scripts/ai-harness/evaluate-predeploy-readiness.mjs --input <evidence.json> [--output .ai/runs/<run-id>/predeploy-readiness.json] [--json]",
    "",
    "The input is repository evidence only; this evaluator never contacts Render or Neon.",
  ].join("\n");
}

function safeOutput(output) {
  const absolute = path.resolve(repoRoot, output);
  const relative = path.relative(runsRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("--output must stay under .ai/runs/");
  }
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  return absolute;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
      return;
    }
    if (!options.input) throw new Error("--input <evidence.json> is required");
    const inputPath = path.resolve(repoRoot, options.input);
    const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const result = evaluatePredeployReadiness(input);
    const text = `${JSON.stringify(result, null, 2)}\n`;
    if (options.output) fs.writeFileSync(safeOutput(options.output), text, "utf8");
    if (options.json || !options.output) process.stdout.write(text);
    else console.log(`[predeploy-readiness] ${result.verdict}: ${result.recommendation}`);
  } catch (error) {
    console.error(`[predeploy-readiness] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
