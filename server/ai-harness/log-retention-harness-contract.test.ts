import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateLogRetentionHarness } from "../../scripts/ai-harness/validate-log-retention.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), "utf8"));
}

function saveJson(relativePath, data) {
  fs.writeFileSync(path.join(repoRoot, relativePath), JSON.stringify(data, null, 2) + "\n");
}

describe("log retention harness contract", () => {
  it("keeps retention policy, runner, scheduler, and harness wiring in lockstep", () => {
    const result = validateLogRetentionHarness(repoRoot);
    expect(result.errors).toEqual([]);
    expect(result.checks.sentinelChecks).toBeGreaterThanOrEqual(2);
    expect(result.checks.repoScheduleWired).toBe(true);
  });

  it("never promotes repository wiring to live retention proof", () => {
    const contract = loadJson(".ai/log-retention-contract.json");
    expect(contract.proof.repoValidationProvesLiveExecution).toBe(false);
    expect(contract.proof.liveObservationMarker).toBe("[retention] done. rows_deleted=");

    const result = validateLogRetentionHarness(repoRoot);
    expect(result.checks.liveExecutionProven).toBe(false);
  });

  it("requires distinct critical sentinel table+column pairs", () => {
    const result = validateLogRetentionHarness(repoRoot);
    expect(result.checks.distinctSentinelPairs).toContain("security_events.created_at");
    expect(result.checks.distinctSentinelPairs).toContain("foundry_run_logs.created_at");
    expect(new Set(result.checks.distinctSentinelPairs).size).toBe(result.checks.distinctSentinelPairs.length);
  });

  it("validates every runner entry against the contract", () => {
    const result = validateLogRetentionHarness(repoRoot);
    const runnerMissing = result.errors.filter((e) => e.startsWith("retention runner missing contract entry:"));
    const runnerExtra = result.errors.filter((e) => e.startsWith("retention runner has untracked entry:"));
    expect(runnerMissing).toEqual([]);
    expect(runnerExtra).toEqual([]);
  });

  describe("negative tests for escape hatches", () => {
    it("rejects duplicate critical sentinel table+column pairs", () => {
      const contractPath = ".ai/log-retention-contract.json";
      const original = loadJson(contractPath);
      const dupe = { ...original.criticalSentinels[0], id: "dupe" };
      const modified = { ...original, criticalSentinels: [original.criticalSentinels[0], dupe] };
      saveJson(contractPath, modified);
      try {
        const result = validateLogRetentionHarness(repoRoot);
        expect(result.errors.some((e) => e.includes("duplicate table+column pairs"))).toBe(true);
      } finally {
        saveJson(contractPath, original);
      }
    });

    it("rejects missing required sentinel (security_events.created_at)", () => {
      const contractPath = ".ai/log-retention-contract.json";
      const original = loadJson(contractPath);
      const modified = {
        ...original,
        criticalSentinels: original.criticalSentinels.filter(
          (s) => !(s.table === "security_events" && s.column === "created_at"),
        ),
      };
      saveJson(contractPath, modified);
      try {
        const result = validateLogRetentionHarness(repoRoot);
        expect(result.errors.some((e) => e.includes("security_events.created_at is required"))).toBe(true);
      } finally {
        saveJson(contractPath, original);
      }
    });

    it("rejects missing required sentinel (foundry_run_logs.created_at)", () => {
      const contractPath = ".ai/log-retention-contract.json";
      const original = loadJson(contractPath);
      const modified = {
        ...original,
        criticalSentinels: original.criticalSentinels.filter(
          (s) => !(s.table === "foundry_run_logs" && s.column === "created_at"),
        ),
      };
      saveJson(contractPath, modified);
      try {
        const result = validateLogRetentionHarness(repoRoot);
        expect(result.errors.some((e) => e.includes("foundry_run_logs.created_at is required"))).toBe(true);
      } finally {
        saveJson(contractPath, original);
      }
    });

    it("rejects registry entry with wrong command field", () => {
      const validatorPath = ".ai/validator-registry.json";
      const original = loadJson(validatorPath);
      const entry = original.validators.find((v) => v.id === "log-retention");
      const origCommand = entry.command;
      entry.command = "node wrong/path.mjs";
      saveJson(validatorPath, original);
      try {
        const result = validateLogRetentionHarness(repoRoot);
        expect(result.errors.some((e) => e.includes("log-retention") && e.includes("command expected"))).toBe(true);
      } finally {
        entry.command = origCommand;
        saveJson(validatorPath, original);
      }
    });

    it("rejects registry entry with wrong workflow path", () => {
      const workflowPath = ".ai/workflow-registry.json";
      const original = loadJson(workflowPath);
      const entry = original.workflows.find((w) => w.id === "axtask.log-retention-capacity-defense.v1");
      const origPath = entry.path;
      entry.path = ".ai/wrong/path.md";
      saveJson(workflowPath, original);
      try {
        const result = validateLogRetentionHarness(repoRoot);
        expect(result.errors.some((e) => e.includes("log-retention-capacity-defense") && e.includes("path expected"))).toBe(true);
      } finally {
        entry.path = origPath;
        saveJson(workflowPath, original);
      }
    });

    it("rejects registry entry with wrong artifact producer", () => {
      const artifactPath = ".ai/artifact-registry.json";
      const original = loadJson(artifactPath);
      const entry = original.artifacts.find((a) => a.id === "log-retention-proof");
      const origProducer = entry.producer;
      entry.producer = "wrong.workflow.id";
      saveJson(artifactPath, original);
      try {
        const result = validateLogRetentionHarness(repoRoot);
        expect(result.errors.some((e) => e.includes("log-retention-proof") && e.includes("producer expected"))).toBe(true);
      } finally {
        entry.producer = origProducer;
        saveJson(artifactPath, original);
      }
    });

    it("rejects registry entry with wrong trigger workflowId", () => {
      const triggerPath = ".ai/trigger-registry.json";
      const original = loadJson(triggerPath);
      const entry = original.triggers.find((t) => t.id === "log-retention-risk");
      const origWorkflowId = entry.workflowId;
      entry.workflowId = "wrong.workflow.id";
      saveJson(triggerPath, original);
      try {
        const result = validateLogRetentionHarness(repoRoot);
        expect(result.errors.some((e) => e.includes("log-retention-risk") && e.includes("workflowId expected"))).toBe(true);
      } finally {
        entry.workflowId = origWorkflowId;
        saveJson(triggerPath, original);
      }
    });

    it("rejects commented-out runner entry as executable", () => {
      const runnerPath = path.join(repoRoot, "scripts", "db-retention.mjs");
      const original = fs.readFileSync(runnerPath, "utf8");
      const commented = original.replace(
        '{ table: "security_events",           column: "created_at", window: "90 days"  }',
        '// { table: "security_events",           column: "created_at", window: "90 days"  }',
      );
      fs.writeFileSync(runnerPath, commented);
      try {
        const result = validateLogRetentionHarness(repoRoot);
        expect(result.errors.some((e) => e.includes("retention runner missing contract entry: security_events") || e.includes("untracked entry"))).toBe(true);
      } finally {
        fs.writeFileSync(runnerPath, original);
      }
    });

    it("rejects policy table with wrong window as matching", () => {
      const policyPath = path.join(repoRoot, "docs", "DB_RETENTION_POLICY.md");
      const original = fs.readFileSync(policyPath, "utf8");
      const modified = original.replace(
        "| `security_events`             | `created_at`| 90 days",
        "| `security_events`             | `created_at`| 999 days",
      );
      fs.writeFileSync(policyPath, modified);
      try {
        const result = validateLogRetentionHarness(repoRoot);
        expect(result.errors.some((e) => e.includes("retention policy missing security_events.created_at"))).toBe(true);
      } finally {
        fs.writeFileSync(policyPath, original);
      }
    });
  });
});
