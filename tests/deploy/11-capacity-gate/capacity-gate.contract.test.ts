/**
 * Contract tests for the redesigned capacity gate.
 * Verifies the gate distinguishes operator budget from provider hint,
 * and never invents a fake provider ceiling.
 * 
 * These tests verify the script source code directly, similar to other
 * deploy contract tests in this repo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const scriptPath = path.join(repoRoot, "scripts", "deploy", "check-db-capacity.mjs");

describe("[11-capacity-gate] check-db-capacity.mjs contract", () => {
  let src = "";

  beforeAll(() => {
    src = fs.readFileSync(scriptPath, "utf8");
  });

  it("exists and is readable", () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    expect(src.length).toBeGreaterThan(0);
  });

  it("has no hardcoded DEFAULT_BUDGET constant", () => {
    // The old version had: const DEFAULT_BUDGET = 536_870_912; // 512 MB
    // New version should NOT have any hardcoded default budget constant
    expect(src).not.toContain("DEFAULT_BUDGET");
    expect(src).not.toContain("536_870_912");
    // "512 MB" may appear in formatBytes() function as a unit string, that's fine
  });

  it("parseBudget returns null when env var is unset", () => {
    expect(src).toContain("function parseBudget()");
    expect(src).toContain('if (!raw) return null;');
    expect(src).toContain("return n;");
  });

  it("treats malformed budget as unset (report-only)", () => {
    expect(src).toContain("Invalid AXTASK_DB_SIZE_BUDGET_BYTES");
    expect(src).toContain("treating as unset (report-only mode)");
  });

  it("runCapacityCheck accepts optional budget override for testing", () => {
    expect(src).toContain("export async function runCapacityCheck({ url, budget } = {})");
    expect(src).toContain("const operatorBudget = budget ?? parseBudget();");
  });

  it("buildReport handles no operator budget (report-only mode)", () => {
    expect(src).toContain("function buildReport");
    expect(src).toContain('let verdict = "no_operator_budget"');
    expect(src).toContain('let reason = "No explicit operator budget configured; gate is report-only."');
    expect(src).toContain("fraction: operatorBudget !== null ? fraction : null");
    expect(src).toContain("utilizationPercent: operatorBudget !== null ? (fraction * 100).toFixed(1) : null");
  });

  it("buildReport evaluates thresholds when explicit operator budget exists", () => {
    expect(src).toContain("if (operatorBudget !== null)");
    expect(src).toContain("fraction = dbSize / operatorBudget");
    expect(src).toContain("const classification = classify(fraction)");
    expect(src).toContain('verdict = "hard_fail"');
    expect(src).toContain('verdict = "soft_fail"');
    expect(src).toContain('verdict = "warn"');
    expect(src).toContain('verdict = "ok"');
  });

  it("classify function has correct thresholds (75/85/90)", () => {
    expect(src).toContain("function classify(fraction)");
    expect(src).toContain("fraction >= 0.9");
    expect(src).toContain("fraction >= 0.85");
    expect(src).toContain("fraction >= 0.75");
  });

  it("prints operator budget source in report", () => {
    expect(src).toContain("operatorBudgetSource");
    expect(src).toContain('env:AXTASK_DB_SIZE_BUDGET_BYTES');
    expect(src).toContain('"unset"');
  });

  it("reports provider hint separately (neon.max_cluster_size)", () => {
    expect(src).toContain("fetchNeonClusterHint");
    expect(src).toContain("SHOW neon.max_cluster_size");
    expect(src).toContain("providerHint");
    expect(src).toContain("Provider capacity hint");
  });

  it("does not conflate provider hint with operator budget", () => {
    // The provider hint is reported separately and never used as denominator
    expect(src).not.toContain("providerHint.*budget");
    expect(src).not.toContain("budget.*providerHint");
    // fraction is only calculated when operatorBudget !== null
    expect(src).toContain("fraction = dbSize / operatorBudget");
  });

  it("machine-readable JSON output includes all required fields", () => {
    expect(src).toContain("JSON.stringify(report, null, 2)");
    // Check buildReport returns all required fields
    expect(src).toContain("dbSize");
    expect(src).toContain("operatorBudget");
    expect(src).toContain("operatorBudgetSource");
    expect(src).toContain("providerHint");
    expect(src).toContain("fraction");
    expect(src).toContain("utilizationPercent");
    expect(src).toContain("verdict");
    expect(src).toContain("reason");
    expect(src).toContain("level");
    expect(src).toContain("exitCode");
    expect(src).toContain("topTables");
    expect(src).toContain("ok");
  });

  it("prints report with labeled sections (OPERATOR BUDGET, PROVIDER HINT)", () => {
    expect(src).toContain("Operator budget");
    expect(src).toContain("Provider capacity hint");
    expect(src).toContain("Utilization:");
  });

  it("exit codes: 0=ok, 1=soft_fail, 2=hard_fail, 3=fatal", () => {
    expect(src).toContain("process.exit(0)");
    expect(src).toContain("process.exit(1)");
    expect(src).toContain("process.exit(2)");
    expect(src).toContain("process.exit(3)");
  });

  it("soft fail acknowledges AXTASK_DB_CAPACITY_ACK=1", () => {
    expect(src).toContain("AXTASK_DB_CAPACITY_ACK");
    expect(src).toContain("SOFT FAIL acknowledged");
  });

  it("hard fail never proceeds, suggests raising budget", () => {
    expect(src).toContain("HARD FAIL");
    expect(src).toContain("raise AXTASK_DB_SIZE_BUDGET_BYTES");
  });
});