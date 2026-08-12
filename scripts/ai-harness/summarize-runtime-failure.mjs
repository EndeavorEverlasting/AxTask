#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateRuntimeProofFile } from "./validate-runtime-proof.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const SCHEMA_ID = "axtask.runtime-failure-summary.v1";
const TEMPLATE_PATH = ".ai/reports/runtime-failure-report-template.md";

function array(value) {
  return Array.isArray(value) ? value : [];
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function classify(entries) {
  const text = entries.map((entry) => `${entry.id ?? ""} ${entry.description ?? ""}`).join(" ").toLowerCase();
  if (!text.trim()) return "none";
  if (/schema|migration|drizzle/.test(text)) return "schema-migration";
  if (/build|bundle|compile|vite|esbuild/.test(text)) return "build";
  if (/health|ready|client-shell|launcher|startup|runtime|http/.test(text)) return "runtime";
  if (/docker|postgres|database|environment|marker|host-gate|db-gate|allow-marker|tooling/.test(text)) return "environment-tooling";
  return "unknown";
}

function cleanFailure(entry, source) {
  return {
    id: String(entry?.id ?? "unknown"),
    description: String(entry?.description ?? "Unspecified runtime failure"),
    source,
    ...(source === "failure" && nonEmpty(entry?.severity) ? { severity: entry.severity } : {}),
  };
}

export function buildRuntimeFailureSummary(proof, sourceProof = "runtime-proof.json") {
  const failedAssertions = array(proof?.assertions)
    .filter((assertion) => assertion?.passed !== true)
    .map((assertion) => cleanFailure(assertion, "assertion"));
  const failures = array(proof?.failures).map((failure) => cleanFailure(failure, "failure"));
  const entries = [...failures, ...failedAssertions];
  const status = entries.length > 0 ? "NO_GO" : "NO_FAILURES";
  return {
    schemaId: SCHEMA_ID,
    authorityRef: "axtask.agent-authority.v1",
    candidateSha: String(proof?.candidateSha ?? ""),
    sourceProof: path.basename(sourceProof),
    status,
    classification: classify(entries),
    attainedProofLevel: String(proof?.attainedProofLevel ?? ""),
    proofCeiling: String(proof?.proofCeiling ?? ""),
    primaryFailure: entries[0] ?? null,
    failedAssertions,
    failures,
    nextWorkflow: status === "NO_GO" ? "axtask.failure-recovery.v1" : "none",
    retryPolicy: status === "NO_GO" ? "do-not-retry-unchanged" : "none",
  };
}

export function validateRuntimeFailureSummary(summary) {
  const errors = [];
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return ["summary must be a JSON object"];
  if (summary.schemaId !== SCHEMA_ID) errors.push(`schemaId must equal ${SCHEMA_ID}`);
  if (summary.authorityRef !== "axtask.agent-authority.v1") errors.push("authorityRef must equal axtask.agent-authority.v1");
  for (const field of ["candidateSha", "sourceProof", "status", "classification", "attainedProofLevel", "proofCeiling", "nextWorkflow", "retryPolicy"]) {
    if (!nonEmpty(summary[field])) errors.push(`${field} must be a non-empty string`);
  }
  if (!["NO_GO", "NO_FAILURES"].includes(summary.status)) errors.push("status must be NO_GO or NO_FAILURES");
  if (!["environment-tooling", "schema-migration", "build", "runtime", "unknown", "none"].includes(summary.classification)) errors.push("classification is invalid");
  if (!Array.isArray(summary.failedAssertions)) errors.push("failedAssertions must be an array");
  if (!Array.isArray(summary.failures)) errors.push("failures must be an array");
  if (summary.status === "NO_GO" && !summary.primaryFailure) errors.push("NO_GO requires primaryFailure");
  if (summary.status === "NO_FAILURES" && summary.primaryFailure !== null) errors.push("NO_FAILURES requires primaryFailure=null");
  return errors;
}

function listMarkdown(items) {
  return items.length > 0
    ? items.map((item) => `- \`${item.id}\` — ${item.description}${item.severity ? ` (${item.severity})` : ""}`).join("\n")
    : "- none";
}

function renderReport(rootDir, summary) {
  const template = fs.readFileSync(path.join(rootDir, TEMPLATE_PATH), "utf8");
  const primary = summary.primaryFailure
    ? `\`${summary.primaryFailure.id}\` — ${summary.primaryFailure.description}`
    : "none";
  const values = {
    candidateSha: summary.candidateSha,
    sourceProof: summary.sourceProof,
    status: summary.status,
    classification: summary.classification,
    attainedProofLevel: summary.attainedProofLevel,
    proofCeiling: summary.proofCeiling,
    primaryFailure: primary,
    failedAssertions: listMarkdown(summary.failedAssertions),
    failures: listMarkdown(summary.failures),
    nextWorkflow: summary.nextWorkflow,
    retryPolicy: summary.retryPolicy,
  };
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{{${key}}}`, String(value)), template);
}

function displayPath(rootDir, absolutePath) {
  const relative = path.relative(rootDir, absolutePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.replaceAll(path.sep, "/")
    : path.basename(absolutePath);
}

export function summarizeRuntimeFailureFile(rootDir = DEFAULT_REPO_ROOT, proofPath) {
  const absoluteProofPath = path.resolve(proofPath);
  const proofValidation = validateRuntimeProofFile(rootDir, absoluteProofPath);
  if (proofValidation.errors.length > 0) {
    throw new Error(`runtime proof is invalid: ${proofValidation.errors.join("; ")}`);
  }
  const proof = JSON.parse(fs.readFileSync(absoluteProofPath, "utf8"));
  const summary = buildRuntimeFailureSummary(proof, absoluteProofPath);
  const summaryErrors = validateRuntimeFailureSummary(summary);
  if (summaryErrors.length > 0) throw new Error(`runtime failure summary is invalid: ${summaryErrors.join("; ")}`);

  const directory = path.dirname(absoluteProofPath);
  const summaryPath = path.join(directory, "runtime-failure-summary.json");
  const reportPath = path.join(directory, "runtime-failure-report.md");
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportPath, renderReport(rootDir, summary), "utf8");
  return { summary, summaryPath, reportPath };
}

export function checkRuntimeFailureSummaryFile(rootDir = DEFAULT_REPO_ROOT, summaryPath) {
  const absoluteSummaryPath = path.resolve(summaryPath);
  if (!fs.existsSync(absoluteSummaryPath)) throw new Error(`missing runtime failure summary: ${summaryPath}`);
  const summary = JSON.parse(fs.readFileSync(absoluteSummaryPath, "utf8"));
  const errors = validateRuntimeFailureSummary(summary);
  if (errors.length > 0) throw new Error(`runtime failure summary is invalid: ${errors.join("; ")}`);
  const proofPath = path.join(path.dirname(absoluteSummaryPath), "runtime-proof.json");
  const proofValidation = validateRuntimeProofFile(rootDir, proofPath);
  if (proofValidation.errors.length > 0) throw new Error(`sibling runtime proof is invalid: ${proofValidation.errors.join("; ")}`);
  const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
  const expected = buildRuntimeFailureSummary(proof, proofPath);
  if (JSON.stringify(summary) !== JSON.stringify(expected)) throw new Error("runtime failure summary does not match sibling runtime-proof.json");
  return summary;
}

function main() {
  const args = process.argv.slice(2);
  try {
    if (args[0] === "--check") {
      if (!args[1]) throw new Error("usage: summarize-runtime-failure.mjs --check <runtime-failure-summary.json>");
      const summary = checkRuntimeFailureSummaryFile(DEFAULT_REPO_ROOT, args[1]);
      console.log(`[runtime-failure] PASS schema=${SCHEMA_ID} status=${summary.status} class=${summary.classification}`);
      return;
    }
    if (!args[0]) throw new Error("usage: summarize-runtime-failure.mjs <runtime-proof.json>");
    const result = summarizeRuntimeFailureFile(DEFAULT_REPO_ROOT, args[0]);
    console.log(`[runtime-failure] PASS schema=${SCHEMA_ID} status=${result.summary.status} class=${result.summary.classification}`);
    console.log(`RUNTIME_FAILURE_PRIMARY=${result.summary.primaryFailure?.id ?? "none"}`);
    console.log(`RUNTIME_FAILURE_SUMMARY=${displayPath(DEFAULT_REPO_ROOT, result.summaryPath)}`);
    console.log(`RUNTIME_FAILURE_REPORT=${displayPath(DEFAULT_REPO_ROOT, result.reportPath)}`);
  } catch (error) {
    console.error(`[runtime-failure] FAIL ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
