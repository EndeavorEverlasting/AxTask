/**
 * Verifies the deploy failure classifier maps real log fixtures to the
 * right buckets. Includes the exact log text from the Neon 512 MB failure
 * that motivated this tool.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyLog } from "../../../scripts/deploy/classify-deploy-failure.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "test-fixtures",
  "deploy-logs",
);

function loadFixture(name: string): string {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

describe("[09-failure-classification] classifyLog", () => {
  it("identifies the Neon 512 MB capacity failure specifically", () => {
    const log = loadFixture("neon-capacity-exceeded.txt");
    expect(classifyLog(log)).toBe("DB_CAPACITY_EXCEEDED_DURING_MIGRATION");
  });

  it("identifies a missing DATABASE_URL as ENV_MISSING", () => {
    const log = loadFixture("env-missing.txt");
    expect(classifyLog(log)).toBe("ENV_MISSING");
  });

  it("identifies a build failure", () => {
    const log = loadFixture("build-failed.txt");
    expect(classifyLog(log)).toBe("BUILD_FAILED");
  });

  it("identifies DB unreachable during migration", () => {
    const log = loadFixture("db-unreachable.txt");
    expect(classifyLog(log)).toBe("DB_UNREACHABLE");
  });

  it("identifies a port-already-in-use startup failure", () => {
    const log = loadFixture("startup-port-conflict.txt");
    expect(classifyLog(log)).toBe("STARTUP_FAILED");
  });

  it("returns UNKNOWN for a clean successful deploy log", () => {
    const log = loadFixture("healthy-success.txt");
    expect(classifyLog(log)).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for empty / non-string input", () => {
    expect(classifyLog("")).toBe("UNKNOWN");
    // @ts-expect-error - deliberate bad input
    expect(classifyLog(null)).toBe("UNKNOWN");
    // @ts-expect-error - deliberate bad input
    expect(classifyLog(undefined)).toBe("UNKNOWN");
  });

  it("prefers DB_CAPACITY over generic MIGRATION_FAILED when both match", () => {
    // Contains the specific capacity signature, plus the generic [migrate] ✗
    // marker. The specific classifier must win.
    const mixed = [
      "[migrate] applying: 0042_foo.sql ...",
      "[migrate] \u2717 0042_foo.sql - project size limit (512 MB) has been exceeded",
      "error code 53100 neon.max_cluster_size",
      "at /app/scripts/apply-migrations.mjs:33",
    ].join("\n");
    expect(classifyLog(mixed)).toBe("DB_CAPACITY_EXCEEDED_DURING_MIGRATION");
  });
});
