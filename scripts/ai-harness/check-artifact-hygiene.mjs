#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../");

const FORBIDDEN_PATTERNS = [
  { pattern: /\.ai\/runs\//, reason: "AI harness runtime artifacts (.ai/runs/) are ephemeral and regenerated" },
  { pattern: /\.ai\/generated\//, reason: "AI harness generated artifacts (.ai/generated/) are ephemeral and regenerated" },
  { pattern: /test-results\//, reason: "Playwright test results (test-results/) are ephemeral" },
  { pattern: /playwright-report\//, reason: "Playwright reports (playwright-report/) are ephemeral" },
  { pattern: /\.(tmp|tmp-)/, reason: "Temporary files (.tmp, .tmp-*) are ephemeral" },
  { pattern: /\.log$/, reason: "Log files (*.log) are ephemeral runtime output" },
  { pattern: /audit\.json$/, reason: "npm audit output (audit.json) is non-reproducible" },
  { pattern: /dist\/build-manifest\.json$/, reason: "Build manifest (dist/build-manifest.json) is regenerated on every build" },
  { pattern: /migrations\/meta\//, reason: "Drizzle metadata (migrations/meta/) is a local by-product" },
  { pattern: /\.local\.md$/, reason: "Local documentation files (*.local.md) are machine-specific" },
  { pattern: /\.local\.json$/, reason: "Local configuration files (*.local.json) are machine-specific" },
  { pattern: /\.env/, reason: "Environment files (.env*) may contain secrets" },
  { pattern: /\.pii\.(json|csv)$/, reason: "PII exports (*.pii.json, *.pii.csv) contain sensitive data" },
  { pattern: /_pii_/, reason: "PII-marked files (*_pii_*) contain sensitive data" },
  { pattern: /scratch-pii\//, reason: "PII scratch directories (scratch-pii/) contain sensitive data" },
  { pattern: /\.backups\//, reason: "Database backup directories (.backups/) contain sensitive data" },
  { pattern: /pii-?export\//, reason: "PII export directories contain sensitive data" },
  { pattern: /private-export\//, reason: "Private export directories contain sensitive data" },
  { pattern: /user-dumps\//, reason: "User dump directories contain sensitive data" },
  { pattern: /data-export-local\//, reason: "Local data export directories contain sensitive data" },
  { pattern: /local-user-data\//, reason: "Local user data directories contain sensitive data" },
  { pattern: /support-notes\.local/, reason: "Local support notes may contain sensitive data" },
  { pattern: /account-recovery\.local/, reason: "Local account recovery notes may contain sensitive data" },
  { pattern: /_extract_logs\//, reason: "Extraction logs (_extract_logs/) are raw runtime output" },
  { pattern: /_rescue_exports\//, reason: "Rescue exports (_rescue_exports/) are raw runtime output" },
  { pattern: /__archetype_fixtures__\//, reason: "Archetype fixtures (__archetype_fixtures__/) may contain raw signal data" },
  { pattern: /\.idea\//, reason: "JetBrains IDE config (.idea/) is machine-specific" },
  { pattern: /\.cursor\/settings\.json$/, reason: "Cursor IDE settings (.cursor/settings.json) are machine-specific" },
  { pattern: /\.cursor\/plans\//, reason: "Cursor planning scratchpads (.cursor/plans/) are ephemeral" },
  { pattern: /node_modules\//, reason: "node_modules/ should not be committed" },
  { pattern: /\.DS_Store$/, reason: "macOS metadata files (.DS_Store) should not be committed" },
];

function getStagedFiles() {
  try {
    const output = execSync("git diff --cached --name-only", { encoding: "utf8", cwd: REPO_ROOT });
    return output.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function checkFile(filePath) {
  const violations = [];
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(filePath)) {
      violations.push({ file: filePath, reason });
    }
  }
  return violations;
}

async function main() {
  const stagedFiles = await getStagedFiles();
  
  if (stagedFiles.length === 0) {
    console.log("[artifact-hygiene] No staged files to check");
    process.exit(0);
  }

  const allViolations = [];
  
  for (const file of stagedFiles) {
    const violations = checkFile(file);
    allViolations.push(...violations);
  }

  if (allViolations.length > 0) {
    console.error("[artifact-hygiene] ❌ Staged files contain forbidden artifacts:");
    console.error("");
    
    for (const { file, reason } of allViolations) {
      console.error(`  ${file}`);
      console.error(`    Reason: ${reason}`);
      console.error("");
    }
    
    console.error("Remediation:");
    console.error("  1. Remove from staging: git restore --staged <file>");
    console.error("  2. Add to .gitignore if the pattern is missing");
    console.error("  3. For .ai/runs/ or .ai/generated/: these are auto-ignored, ensure .gitignore is current");
    console.error("");
    console.error("If this is a false positive (sanitized fixture, tracked release evidence, etc.),");
    console.error("the pattern may need refinement. Open an issue or update the pattern list.");
    
    process.exit(1);
  }

  console.log("[artifact-hygiene] ✅ No forbidden artifacts in staged files");
  process.exit(0);
}

main().catch((err) => {
  console.error("[artifact-hygiene] Fatal error:", err.message);
  process.exit(1);
});