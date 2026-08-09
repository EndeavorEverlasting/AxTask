/**
 * Contract tests for the redesigned capacity gate.
 * Verifies the gate distinguishes operator budget from provider hint,
 * never invents a fake provider ceiling, and fails closed when an explicit
 * operator budget is malformed.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

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

  it("has no hardcoded legacy default budget", () => {
    expect(src).not.toContain("DEFAULT_BUDGET");
    expect(src).not.toContain("536_870_912");
  });

  it("treats an absent env budget as report-only", () => {
    expect(src).toContain("function parseBudget()");
    expect(src).toContain("return normalizeBudget(");
    expect(src).toContain('"AXTASK_DB_SIZE_BUDGET_BYTES"');
    expect(src).toContain('let verdict = "no_operator_budget"');
    expect(src).toContain(
      'let reason = "No explicit operator budget configured; gate is report-only."',
    );
  });

  it("fails closed when an explicit budget is malformed", () => {
    expect(src).toContain("function normalizeBudget(raw, source)");
    expect(src).toContain("must be a positive finite byte count");
    expect(src).toContain("throw new Error");
    expect(src).not.toContain("treating as unset (report-only mode)");
  });

  it("validates both env and test-argument budgets", () => {
    expect(src).toContain("const hasArgumentBudget = budget !== undefined");
    expect(src).toContain('normalizeBudget(budget, "budget argument")');
    expect(src).toContain(": parseBudget()");
  });

  it("buildReport evaluates explicit budget thresholds", () => {
    expect(src).toContain("if (operatorBudget !== null)");
    expect(src).toContain("fraction = dbSize / operatorBudget");
    expect(src).toContain("const classification = classify(fraction)");
    expect(src).toContain('verdict = "hard_fail"');
    expect(src).toContain('verdict = "soft_fail"');
    expect(src).toContain('verdict = "warn"');
    expect(src).toContain('verdict = "ok"');
  });

  it("classify function has correct thresholds (75/85/90)", () => {
    expect(src).toContain("fraction >= 0.9");
    expect(src).toContain("fraction >= 0.85");
    expect(src).toContain("fraction >= 0.75");
  });

  it("prints operator budget source in report", () => {
    expect(src).toContain("operatorBudgetSource");
    expect(src).toContain("env:AXTASK_DB_SIZE_BUDGET_BYTES");
    expect(src).toContain('"unset"');
  });

  it("reports provider hint separately", () => {
    expect(src).toContain("fetchNeonClusterHint");
    expect(src).toContain("SHOW neon.max_cluster_size");
    expect(src).toContain("providerHint");
    expect(src).toContain("Provider capacity hint");
  });

  it("never uses provider hint as the budget denominator", () => {
    expect(src).toContain("fraction = dbSize / operatorBudget");
    expect(src).not.toContain("dbSize / providerHint");
    expect(src).not.toContain("operatorBudget = providerHint");
  });

  it("machine-readable report includes required fields", () => {
    for (const field of [
      "dbSize",
      "operatorBudget",
      "operatorBudgetSource",
      "providerHint",
      "fraction",
      "utilizationPercent",
      "verdict",
      "reason",
      "level",
      "exitCode",
      "topTables",
      "ok",
    ]) {
      expect(src).toContain(field);
    }
    expect(src).toContain("JSON.stringify(report, null, 2)");
  });

  it("uses literal interpolation for warn/soft-fail reasons", () => {
    expect(src).toContain("`[db-capacity] SOFT FAIL: ${report.reason}");
    expect(src).toContain("`[db-capacity] WARN: ${report.reason}");
  });

  it("documents exit 3 for malformed explicit configuration", () => {
    expect(src).toContain("3 - Fatal error");
    expect(src).toContain("process.exit(3)");
  });

  it("soft fail remains operator-acknowledgeable", () => {
    expect(src).toContain("AXTASK_DB_CAPACITY_ACK");
    expect(src).toContain("SOFT FAIL acknowledged");
  });

  it("hard fail does not advise blindly raising a provider limit", () => {
    expect(src).toContain("HARD FAIL");
    expect(src).toContain("deliberately revise AXTASK_DB_SIZE_BUDGET_BYTES");
    expect(src).toContain("documenting the new operator limit");
  });
});
