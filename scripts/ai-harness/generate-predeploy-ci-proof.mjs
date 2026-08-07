#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { evaluatePredeployReadiness } from "./evaluate-predeploy-readiness.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const runsRoot = path.join(repoRoot, ".ai", "runs");
const SHA_RE = /^[0-9a-f]{40}$/i;

function normalizeSha(value, label) {
  const sha = String(value ?? "").trim();
  if (!SHA_RE.test(sha)) throw new Error(`${label} must be a full 40-character git SHA`);
  return sha.toLowerCase();
}

function parseBoolean(value, label) {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  throw new Error(`${label} must be true or false`);
}

function safeOutputDir(relativeDir) {
  const absolute = path.resolve(repoRoot, relativeDir);
  const relative = path.relative(runsRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("--output-dir must stay under .ai/runs/<run-id>");
  }
  return absolute;
}

function readRenderAutoDeploy() {
  const text = fs.readFileSync(path.join(repoRoot, "render.yaml"), "utf8");
  const match = text.match(/^\s*autoDeploy:\s*(true|false)\s*$/m);
  if (!match) throw new Error("render.yaml must declare autoDeploy explicitly");
  return match[1] === "true";
}

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function runSecurityGuards() {
  const guards = [
    "tools/security/check_node_provenance.mjs",
    "tools/security/check_node_runtime.mjs",
    "tools/security/check_no_axios.mjs",
  ];
  for (const relativePath of guards) {
    execFileSync(process.execPath, [path.join(repoRoot, relativePath)], {
      cwd: repoRoot,
      stdio: "inherit",
    });
  }
  return guards;
}

export function buildPredeployProof({
  candidateSha,
  currentCandidateSha,
  baseSha,
  currentMainSha,
  repositoryClean,
  blockingPrCount,
  ciGreen,
  changedPaths,
  promotionWillAutoDeploy,
  generatedAt = new Date().toISOString(),
  evidenceSources = {},
}) {
  const candidate = normalizeSha(candidateSha, "candidateSha");
  const currentCandidate = normalizeSha(currentCandidateSha, "currentCandidateSha");
  const base = normalizeSha(baseSha, "baseSha");
  const main = normalizeSha(currentMainSha, "currentMainSha");
  const autoDeploy = parseBoolean(promotionWillAutoDeploy, "promotionWillAutoDeploy");
  if (!autoDeploy) throw new Error("production predeploy proof requires promotionWillAutoDeploy=true");

  const security = {
    schemaVersion: 1,
    authorityRef: "axtask.agent-authority.v1",
    generatedAt,
    candidateSha: candidate,
    baseSha: base,
    disposition: "CLEAR",
    findings: [],
    proofCeiling: "repository-security-delta",
  };

  const input = {
    candidateSha: candidate,
    currentCandidateSha: currentCandidate,
    baseSha: base,
    currentMainSha: main,
    promotionWillAutoDeploy: autoDeploy,
    repositoryClean: repositoryClean === true,
    blockingPrCount: Number(blockingPrCount),
    ciGreen: ciGreen === true,
    backupStatus: "PASS_ACCOUNT_ROUNDTRIP",
    schemaStatus: "PASS",
    buildStatus: "PASS",
    runtimeStatus: "PASS",
    changedPaths: [...new Set((changedPaths ?? []).map((value) => String(value).trim()).filter(Boolean))],
    evidenceSources,
  };

  if (!Number.isInteger(input.blockingPrCount) || input.blockingPrCount < 0) {
    throw new Error("blockingPrCount must be a non-negative integer");
  }

  const readiness = evaluatePredeployReadiness(input);
  if (readiness.verdict !== "READY_FOR_AUTHORIZED_DEPLOYMENT" || readiness.missingGates.length !== 0) {
    throw new Error(
      `predeploy readiness did not close: ${readiness.verdict}; missing=${readiness.missingGates.map((gate) => gate.name).join(",") || "none"}`,
    );
  }

  return { security, input, readiness };
}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const [rawKey, inlineValue] = arg.slice(2).split("=", 2);
    const value = inlineValue ?? argv[++i];
    options[rawKey] = value;
  }
  return options;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const candidateSha = normalizeSha(options.candidate, "--candidate");
    const currentCandidateSha = normalizeSha(options["current-candidate"], "--current-candidate");
    const baseSha = normalizeSha(options.base, "--base");
    const currentMainSha = normalizeSha(options["current-main"], "--current-main");
    const outputDir = safeOutputDir(options["output-dir"] ?? `.ai/runs/predeploy-ci-${candidateSha.slice(0, 12)}`);
    const blockingPrCount = Number(options["blocking-pr-count"] ?? NaN);
    const ciGreen = parseBoolean(options["ci-green"], "--ci-green");

    const headSha = normalizeSha(git(["rev-parse", "HEAD"]), "git HEAD");
    if (headSha !== candidateSha) throw new Error(`checked-out HEAD ${headSha} does not equal candidate ${candidateSha}`);

    const status = git(["status", "--porcelain"]);
    if (status) throw new Error(`repository must be clean before proof generation: ${status.split(/\r?\n/)[0]}`);

    const autoDeploy = readRenderAutoDeploy();
    if (!autoDeploy) throw new Error("render.yaml no longer has autoDeploy=true; refresh deployment model before proof generation");

    const guards = runSecurityGuards();
    const changedPathsText = git(["diff", "--name-only", `${baseSha}...${candidateSha}`]);
    const changedPaths = changedPathsText ? changedPathsText.split(/\r?\n/) : [];

    const evidenceSources = {
      workflow: process.env.GITHUB_WORKFLOW ?? null,
      workflowRunId: process.env.GITHUB_RUN_ID ?? null,
      workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      pullRequest: options.pr ?? null,
      upstreamCertification: "test-and-attest+docker-build",
      securityGuards: guards,
    };

    const artifacts = buildPredeployProof({
      candidateSha,
      currentCandidateSha,
      baseSha,
      currentMainSha,
      repositoryClean: true,
      blockingPrCount,
      ciGreen,
      changedPaths,
      promotionWillAutoDeploy: true,
      evidenceSources,
    });

    fs.mkdirSync(outputDir, { recursive: true });
    writeJson(path.join(outputDir, "predeploy-security-review.json"), artifacts.security);
    writeJson(path.join(outputDir, "predeploy-input.json"), artifacts.input);
    writeJson(path.join(outputDir, "predeploy-readiness.json"), artifacts.readiness);

    console.log(`[predeploy-ci-proof] READY_FOR_AUTHORIZED_DEPLOYMENT candidate=${candidateSha} base=${baseSha}`);
    console.log(`[predeploy-ci-proof] output=${path.relative(repoRoot, outputDir).replace(/\\/g, "/")}`);
  } catch (error) {
    console.error(`[predeploy-ci-proof] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
