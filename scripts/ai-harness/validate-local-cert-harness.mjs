#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

function readText(rootDir, relativePath, errors) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`missing file: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function readJson(rootDir, relativePath, errors) {
  const text = readText(rootDir, relativePath, errors);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${relativePath}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function hasId(items, id) {
  return Array.isArray(items) && items.some((item) => item?.id === id);
}

export function validateLocalCertHarness(rootDir = DEFAULT_REPO_ROOT) {
  const errors = [];
  const harness = readJson(rootDir, ".ai/harness.json", errors);
  const map = readJson(rootDir, ".ai/codebase-map.json", errors);
  const artifacts = readJson(rootDir, ".ai/artifact-registry.json", errors);
  const validators = readJson(rootDir, ".ai/validator-registry.json", errors);
  const workflows = readJson(rootDir, ".ai/workflow-registry.json", errors);

  const workflowPath = ".ai/workflows/local-deployment-certification.md";
  const skillPath = ".ai/skills/runtime-proof.md";
  const localCertSkillPath = ".ai/skills/local-deployment-certification.md";
  const schemaPath = ".ai/runtime-proof.schema.json";
  const proofValidatorPath = "scripts/ai-harness/validate-runtime-proof.mjs";
  const harnessValidatorPath = "scripts/ai-harness/validate-local-cert-harness.mjs";
  const sessionSafeRunnerPath = "scripts/ai-harness/run-r7-local-cert.ps1";
  const runtimeFailureSchemaPath = ".ai/schemas/runtime-failure-summary.schema.json";
  const runtimeFailureScriptPath = "scripts/ai-harness/summarize-runtime-failure.mjs";
  const runtimeFailureReportPath = ".ai/reports/runtime-failure-report-template.md";
  const runtimeFailureTestPath = "server/ai-harness/runtime-failure-summary-contract.test.ts";
  const contractTestPath = "server/ai-harness/local-production-certification-contract.test.ts";

  for (const requiredPath of [workflowPath, skillPath, localCertSkillPath, schemaPath, proofValidatorPath, harnessValidatorPath, sessionSafeRunnerPath, runtimeFailureSchemaPath, runtimeFailureScriptPath, runtimeFailureReportPath, runtimeFailureTestPath, contractTestPath, "scripts/deploy/run-local-cert.mjs"]) {
    if (!fs.existsSync(path.join(rootDir, requiredPath))) errors.push(`local-cert harness missing tracked dependency: ${requiredPath}`);
  }

  const requiredHarnessComponents = {
    "local-cert": workflowPath,
    "runtime-proof": schemaPath,
    "runtime-proof-skill": skillPath,
    "local-certification-skill": localCertSkillPath,
    "runtime-proof-validator": proofValidatorPath,
    "local-cert-harness-validator": harnessValidatorPath,
    "r7-session-safe-runner": sessionSafeRunnerPath,
    "local-cert-contract-test": contractTestPath,
  };

  const runtimeFailureComponents = {
    "runtime-failure-summary-schema": runtimeFailureSchemaPath,
    "runtime-failure-summarizer": runtimeFailureScriptPath,
    "runtime-failure-report": runtimeFailureReportPath,
    "runtime-failure-contract-test": runtimeFailureTestPath,
  };

  if (harness) {
    for (const [id, expectedPath] of Object.entries({ ...requiredHarnessComponents, ...runtimeFailureComponents })) {
      const component = (harness.components ?? []).find((item) => item?.id === id);
      if (!component) {
        errors.push(`.ai/harness.json: missing local-cert component ${id}`);
      } else if (component.path !== expectedPath) {
        errors.push(`.ai/harness.json: component ${id} must point to ${expectedPath}`);
      }
    }
    if (!(harness.skills ?? []).includes("axtask.skill.local-deployment-certification.v1")) {
      errors.push(".ai/harness.json: missing axtask.skill.local-deployment-certification.v1");
    }
  }

  if (map) {
    const commandIds = new Set((map.commands ?? []).map((item) => item?.id));
    for (const id of ["local-certification", "r7-session-safe", "runtime-proof-validate", "runtime-failure-triage", "local-cert-harness-validate"]) {
      if (!commandIds.has(id)) errors.push(`.ai/codebase-map.json: missing local-cert command ${id}`);
    }
    if (!(map.knownTraps ?? []).some((item) => typeof item === "string" && item.includes("process-isolated") && item.includes("environment variables"))) {
      errors.push(".ai/codebase-map.json: knownTraps must cover process-isolated shell environment loss");
    }
    if (!(map.knownTraps ?? []).some((item) => typeof item === "string" && item.includes("schema-valid runtime-proof.json") && item.includes("NO_GO"))) {
      errors.push(".ai/codebase-map.json: knownTraps must distinguish schema validation from runtime success");
    }
  }

  if (artifacts) {
    for (const id of ["runtime-proof", "local-cert-report", "runtime-failure-summary", "runtime-failure-report"]) {
      if (!hasId(artifacts.artifacts, id)) errors.push(`.ai/artifact-registry.json: missing local-cert artifact ${id}`);
    }
    const proof = (artifacts.artifacts ?? []).find((item) => item?.id === "runtime-proof");
    if (proof?.validator !== "node scripts/ai-harness/validate-runtime-proof.mjs <path>") {
      errors.push(".ai/artifact-registry.json: runtime-proof validator must point to validate-runtime-proof.mjs");
    }
    const failureSummary = (artifacts.artifacts ?? []).find((item) => item?.id === "runtime-failure-summary");
    if (failureSummary?.validator !== "node scripts/ai-harness/summarize-runtime-failure.mjs --check <path>") {
      errors.push(".ai/artifact-registry.json: runtime-failure-summary validator must point to summarize-runtime-failure.mjs --check");
    }
  }

  if (validators) {
    for (const id of ["runtime-proof", "local-production-certification", "local-cert-harness"]) {
      if (!hasId(validators.validators, id)) errors.push(`.ai/validator-registry.json: missing local-cert validator ${id}`);
    }
  }

  if (workflows && !hasId(workflows.workflows, "axtask.local-deployment-certification.v1")) {
    errors.push(".ai/workflow-registry.json: missing axtask.local-deployment-certification.v1");
  }

  const workflowText = readText(rootDir, workflowPath, errors);
  for (const heading of ["## Use when", "## Required inputs", "## Command", "## Steps", "## Required assertions", "## Known traps", "## Stop conditions", "## Evidence boundary", "## Proof ceiling"]) {
    if (!workflowText.includes(heading)) errors.push(`${workflowPath}: missing ${heading}`);
  }
  for (const marker of ["run-r7-local-cert.ps1", "same process", ".ai/runs/<run-id>/runtime-proof.json", ".ai/runs/<run-id>/local-cert-report.md", "validate-runtime-proof.mjs", "axtask.skill.local-deployment-certification.v1"]) {
    if (!workflowText.includes(marker)) errors.push(`${workflowPath}: missing artifact/session-safety marker ${marker}`);
  }

  const skillText = readText(rootDir, skillPath, errors);
  for (const marker of ["axtask.skill.runtime-proof.v1", ".ai/runtime-proof.schema.json", "proofCeiling", "deploymentId"]) {
    if (!skillText.includes(marker)) errors.push(`${skillPath}: missing runtime-proof marker ${marker}`);
  }

  const localCertSkillText = readText(rootDir, localCertSkillPath, errors);
  for (const marker of ["axtask.skill.local-deployment-certification.v1", "run-r7-local-cert.ps1", "process-isolated", "DATABASE_URL", "AXTASK_LOCAL_CERT", "runtime-proof.json", "local-runtime"]) {
    if (!localCertSkillText.includes(marker)) errors.push(`${localCertSkillPath}: missing local-cert skill marker ${marker}`);
  }

  const runnerText = readText(rootDir, sessionSafeRunnerPath, errors);
  for (const marker of ["postgres:16-alpine", "$dockerRunArgs", "& docker @dockerRunArgs", "POSTGRES_DB", "AXTASK_LOCAL_CERT", "DATABASE_URL", "run-local-cert.mjs", "validate-runtime-proof.mjs", "summarize-runtime-failure.mjs", "RUNTIME_FAILURE_SUMMARY", "test:deploy", "npm", "docker rm -f", "R7_RUNTIME_PROOF", "R7_PROOF_CEILING=local-runtime"]) {
    if (!runnerText.includes(marker)) errors.push(`${sessionSafeRunnerPath}: missing session-safe runner marker ${marker}`);
  }
  if (/Write-(Host|Output).*DATABASE_URL/i.test(runnerText)) {
    errors.push(`${sessionSafeRunnerPath}: must not print DATABASE_URL`);
  }

  const failureScriptText = readText(rootDir, runtimeFailureScriptPath, errors);
  for (const marker of ["axtask.runtime-failure-summary.v1", "validateRuntimeProofFile", "runtime-failure-summary.json", "runtime-failure-report.md", "do-not-retry-unchanged", "axtask.failure-recovery.v1", "--check"]) {
    if (!failureScriptText.includes(marker)) errors.push(`${runtimeFailureScriptPath}: missing runtime failure triage marker ${marker}`);
  }
  if (failureScriptText.includes("assertion.evidence")) errors.push(`${runtimeFailureScriptPath}: must not copy assertion evidence into runtime failure summary`);

  const failureReportText = readText(rootDir, runtimeFailureReportPath, errors);
  for (const heading of ["## SUMMARY", "## PRIMARY FAILURE", "## FAILED ASSERTIONS", "## RECORDED FAILURES", "## RECOVERY"]) {
    if (!failureReportText.includes(heading)) errors.push(`${runtimeFailureReportPath}: missing ${heading}`);
  }

  const recoveryWorkflowText = readText(rootDir, ".ai/workflows/failure-recovery.md", errors);
  const recoverySkillText = readText(rootDir, ".ai/skills/failure-recovery.md", errors);
  for (const [label, text] of [["failure workflow", recoveryWorkflowText], ["failure skill", recoverySkillText]]) {
    for (const marker of ["summarize-runtime-failure.mjs", "runtime-failure-summary.json", "runtime-failure-report.md"]) {
      if (!text.includes(marker)) errors.push(`${label}: missing runtime failure triage marker ${marker}`);
    }
  }

  const prePush = readText(rootDir, ".githooks/pre-push", errors);
  for (const marker of ["validate-local-cert-harness.mjs", "local-production-certification-contract.test.ts"]) {
    if (!prePush.includes(marker)) errors.push(`.githooks/pre-push: missing local-cert guard ${marker}`);
  }

  const report = readText(rootDir, ".ai/reports/operator-report-template.md", errors);
  if (!report.includes("## RUNTIME PROOF")) errors.push("operator report template missing ## RUNTIME PROOF");
  for (const marker of ["runtime-proof.json", "local-cert-report.md", "proof ceiling"]) {
    if (!report.includes(marker)) errors.push(`operator report template missing runtime-proof marker ${marker}`);
  }

  const readme = readText(rootDir, ".ai/README.md", errors);
  for (const marker of ["axtask.local-deployment-certification.v1", "AXTASK_LOCAL_CERT=1 node scripts/deploy/run-local-cert.mjs", "validate-local-cert-harness.mjs"]) {
    if (!readme.includes(marker)) errors.push(`.ai/README.md: missing local-cert entry marker ${marker}`);
  }

  return { errors, componentsChecked: Object.keys(requiredHarnessComponents).length };
}

function main() {
  const rootDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_REPO_ROOT;
  const result = validateLocalCertHarness(rootDir);
  if (result.errors.length > 0) {
    console.error(`[ai-local-cert-harness] FAIL components=${result.componentsChecked}`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`[ai-local-cert-harness] PASS components=${result.componentsChecked}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
