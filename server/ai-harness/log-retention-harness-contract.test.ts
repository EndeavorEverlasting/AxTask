import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateLogRetentionHarness } from "../../scripts/ai-harness/validate-log-retention.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("log retention harness contract", () => {
  it("keeps retention policy, runner, scheduler, and harness wiring in lockstep", () => {
    const result = validateLogRetentionHarness(repoRoot);
    expect(result.errors).toEqual([]);
    expect(result.checks.sentinelChecks).toBeGreaterThanOrEqual(2);
    expect(result.checks.repoScheduleWired).toBe(true);
  });

  it("never promotes repository wiring to live retention proof", () => {
    const contract = JSON.parse(
      fs.readFileSync(path.join(repoRoot, ".ai", "log-retention-contract.json"), "utf8"),
    );
    expect(contract.proof.repoValidationProvesLiveExecution).toBe(false);
    expect(contract.proof.liveObservationMarker).toBe("[retention] done. rows_deleted=");

    const result = validateLogRetentionHarness(repoRoot);
    expect(result.checks.liveExecutionProven).toBe(false);
  });
});
