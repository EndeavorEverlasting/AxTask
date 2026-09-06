#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const runsRoot = path.join(repoRoot, ".ai", "runs");

const RUNTIME_PATTERNS = [/^client\//, /^server\//, /^shared\//, /^migrations\//, /^render\.yaml$/, /^Dockerfile$/, /^package(?:-lock)?\.json$/, /^scripts\/production-start\.mjs$/, /^scripts\/deploy\//, /^scripts\/db\//];
const SCHEMA_PATTERNS = [/^migrations\//, /^shared\/schema(?:\.ts|\/)/, /^drizzle\.config\.ts$/, /^scripts\/apply-migrations\.mjs$/, /^scripts\/migration-airlock\.mjs$/];
const DEPLOYMENT_PATTERNS = [/^render\.yaml$/, /^Dockerfile$/, /^scripts\/production-start\.mjs$/, /^scripts\/deploy\//];

const RECOVERY_GATE_DEFINITIONS = [
  ["r0", "recovery-r0-render-suspended", ["PASS"], "operator", "Verify R0 in docs/DB_RECOVERY_RUNBOOK.md", "Render must remain suspended with auto-deploy off until the recovery sequence reaches R8."],
  ["r1", "recovery-r1-production-forensics", ["PASS"], "operator", "node scripts/db-size-audit.mjs --forensics --json > production-audit.json", "Current production event mix, timestamps, containment-trigger state, and migration-9999 state must be proven."],
  ["r1_5", "recovery-r1.5-account-evidence", ["PASS"], "operator", "Follow R1.5 in docs/DB_RECOVERY_RUNBOOK.md", "Portable account evidence and independently verified copies must exist before destructive cleanup."],
  ["r2", "recovery-r2-containment", ["PASS"], "operator", "node scripts/db-contain-api-request.mjs --json", "Origin-active api_request containment must be proven before cleanup and deployment recovery."],
  ["r3", "recovery-r3-backup-restore", ["PASS"], "operator", "npm run db:backup:preflight -- --no-ledger", "A protected source-read-only backup and disposable restore proof must be recorded."],
  ["r4", "recovery-r4-logical-cleanup", ["PASS"], "operator", "Follow R4 in docs/DB_RECOVERY_RUNBOOK.md", "The incident cleanup gate must be completed under the preservation and containment prerequisites."],
  ["r5", "recovery-r5-physical-reclaim", ["PASS", "NOT_REQUIRED"], "operator", "node scripts/db-reclaim-api-request.mjs --vacuum-full --json", "Physical reclaim must either pass or be explicitly proven unnecessary from post-cleanup evidence."],
  ["r6", "recovery-r6-capacity-policy", ["PASS"], "operator", "node scripts/deploy/check-db-capacity.mjs", "The post-recovery capacity policy must pass under an explicit operator budget or report-only decision."],
  ["r7", "recovery-r7-local-certification", ["PASS"], "repository-owner", "AXTASK_LOCAL_CERT=1 node scripts/deploy/run-local-cert.mjs", "The exact deployment candidate must have current local production certification."],
];

function normalizePath(value) { return String(value ?? "").replace(/\\/g, "/").replace(/^\.\//, "").trim(); }
function anyMatch(file, patterns) { return patterns.some((pattern) => pattern.test(file)); }

export function classifyChangedPaths(changedPaths = []) {
  const files = [...new Set(changedPaths.map(normalizePath).filter(Boolean))];
  const runtimeAffecting = files.filter((file) => anyMatch(file, RUNTIME_PATTERNS));
  const schemaAffecting = files.filter((file) => anyMatch(file, SCHEMA_PATTERNS));
  const deploymentConfigAffecting = files.filter((file) => anyMatch(file, DEPLOYMENT_PATTERNS));
  return { files, runtimeAffecting, schemaAffecting, deploymentConfigAffecting, docsOrHarnessOnly: files.length > 0 && runtimeAffecting.length === 0, deploymentNeeded: runtimeAffecting.length > 0 };
}

function gate(name, ok, owner, command, reason) { return { name, ok, owner, command, reason }; }

export function buildProductionRecoveryGates(productionRecovery) {
  if (productionRecovery?.active === false) {
    const closureEvidence = String(productionRecovery?.closureEvidence ?? "").trim();
    return [gate(
      "recovery-closure-evidence",
      closureEvidence.length > 0,
      "operator",
      "Record durable incident-closure evidence before setting productionRecovery.active=false",
      "Post-incident mode requires durable closure evidence; a bare active=false assertion cannot bypass an active recovery runbook.",
    )];
  }
  const statuses = productionRecovery?.gates ?? {};
  return RECOVERY_GATE_DEFINITIONS.map(([key, name, accepted, owner, command, reason]) => gate(name, accepted.includes(String(statuses[key] ?? "UNKNOWN")), owner, command, reason));
}

export function evaluatePredeployReadiness(input) {
  const impact = classifyChangedPaths(input.changedPaths ?? []);
  const sameCandidate = Boolean(input.currentMainSha) && input.currentMainSha === input.candidateSha;
  const gates = [
    gate("repository-clean", input.repositoryClean === true, "repository-owner", "git status --short", "Working tree must be clean before release convergence."),
    gate("no-blocking-prs", Number(input.blockingPrCount ?? 0) === 0, "repository-owner", "gh pr list --state open", "Open blocking PRs must be merged, closed, or explicitly quarantined outside the release floor."),
    gate("candidate-current", sameCandidate, "repository-owner", "git fetch origin --prune --no-tags; git rev-parse HEAD; git rev-parse origin/main", "The evaluated candidate must equal current main."),
    gate("required-ci", input.ciGreen === true, "ci-owner", "gh pr checks --required", "Required repository CI must be green on the exact candidate."),
  ];

  if (impact.deploymentNeeded) {
    gates.push(
      gate("account-backup-roundtrip", input.backupStatus === "PASS_ACCOUNT_ROUNDTRIP", "backup-certification", "node scripts/db/run-local-account-backup-cert.mjs", "Runtime-affecting deployment candidates require current disposable account recovery proof."),
      gate("schema-safety", impact.schemaAffecting.length > 0 ? input.schemaStatus === "PASS" : input.schemaStatus !== "FAIL", "database-airlock", "npm run test:deploy:migrations", "Schema-affecting candidates must pass migration safety; other candidates may record NOT_REQUIRED."),
      gate("production-build", input.buildStatus === "PASS", "build-owner", "npm run build", "Runtime-affecting candidates require a successful production build."),
      ...buildProductionRecoveryGates(input.productionRecovery),
    );
  }

  const failed = gates.filter((item) => !item.ok);
  let verdict;
  let recommendation;
  if (failed.some((item) => ["repository-clean", "no-blocking-prs", "candidate-current", "required-ci", "production-build"].includes(item.name))) {
    verdict = "NOT_READY_REPOSITORY"; recommendation = "REPAIR_REPOSITORY_GATE";
  } else if (failed.some((item) => item.name === "account-backup-roundtrip")) {
    verdict = "NOT_READY_BACKUP"; recommendation = "RUN_BACKUP_CERTIFICATION";
  } else if (failed.some((item) => item.name === "schema-safety")) {
    verdict = "NOT_READY_SCHEMA"; recommendation = "REPAIR_SCHEMA_GATE";
  } else if (!impact.deploymentNeeded) {
    verdict = "READY_FOR_LOCAL_ACCEPTANCE"; recommendation = "NO_DEPLOY_NEEDED";
  } else if (input.runtimeStatus === "FAIL") {
    verdict = "NOT_READY_RUNTIME"; recommendation = "REPAIR_LOCAL_RUNTIME";
  } else if (input.runtimeStatus !== "PASS") {
    verdict = "READY_FOR_LOCAL_ACCEPTANCE"; recommendation = "RUN_LOCAL_PRODUCTION_CERTIFICATION";
  } else if (failed.some((item) => item.name.startsWith("recovery-"))) {
    verdict = "NOT_READY_RECOVERY"; recommendation = "COMPLETE_PRODUCTION_RECOVERY_GATES";
  } else {
    verdict = "READY_FOR_AUTHORIZED_DEPLOYMENT"; recommendation = "AWAIT_EXPLICIT_DEPLOYMENT_AUTHORIZATION";
  }

  const costExposure = !impact.deploymentNeeded ? "NONE_NO_DEPLOY_NEEDED" : impact.deploymentConfigAffecting.length > 0 || impact.schemaAffecting.length > 0 ? "PROVIDER_AND_DATABASE_RUNTIME_EXPOSURE" : "APPLICATION_RUNTIME_EXPOSURE";
  return {
    schemaVersion: 1,
    authorityRef: "axtask.agent-authority.v1",
    generatedAt: new Date().toISOString(),
    currentMainSha: input.currentMainSha ?? null,
    candidateSha: input.candidateSha ?? null,
    deploymentNeeded: impact.deploymentNeeded,
    runtimeImpact: impact,
    costEvidence: { classification: costExposure, monetaryEstimate: null, note: "No provider pricing is inferred. Cost exposure is qualitative unless separately sourced." },
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
function usage() { return ["Usage:", "  node scripts/ai-harness/evaluate-predeploy-readiness.mjs --input <evidence.json> [--output .ai/runs/<run-id>/predeploy-readiness.json] [--json]", "", "The input is repository evidence only; this evaluator never contacts Render or Neon.", "productionRecovery is fail-closed; active=false also requires durable closureEvidence."].join("\n"); }
function safeOutput(output) {
  const absolute = path.resolve(repoRoot, output); const relative = path.relative(runsRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("--output must stay under .ai/runs/");
  fs.mkdirSync(path.dirname(absolute), { recursive: true }); return absolute;
}
function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { console.log(usage()); return; }
    if (!options.input) throw new Error("--input <evidence.json> is required");
    const input = JSON.parse(fs.readFileSync(path.resolve(repoRoot, options.input), "utf8"));
    const result = evaluatePredeployReadiness(input); const text = `${JSON.stringify(result, null, 2)}\n`;
    if (options.output) fs.writeFileSync(safeOutput(options.output), text, "utf8");
    if (options.json || !options.output) process.stdout.write(text); else console.log(`[predeploy-readiness] ${result.verdict}: ${result.recommendation}`);
  } catch (error) { console.error(`[predeploy-readiness] FAIL ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
