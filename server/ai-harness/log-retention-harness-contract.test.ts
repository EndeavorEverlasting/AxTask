import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { validateLogRetentionHarness } from "../../scripts/ai-harness/validate-log-retention.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const tempRoots: string[] = [];

function loadJson(root: string, relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function saveJson(root: string, relativePath: string, data: unknown) {
  fs.writeFileSync(path.join(root, relativePath), `${JSON.stringify(data, null, 2)}\n`);
}

function copyRelative(root: string, relativePath: string) {
  const source = path.join(repoRoot, relativePath);
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

/**
 * Negative cases must never mutate the live checkout. Parallel Vitest workers
 * otherwise race harness-infrastructure validation against temporary registry
 * corruption left by these escape-hatch tests.
 */
function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-log-retention-"));
  tempRoots.push(root);
  for (const relativePath of [
    ".ai",
    ".githooks/pre-push",
    "docs/DB_RETENTION_POLICY.md",
    "docs/SCHEDULED_RESOURCE_CONTROLS.md",
    "render.yaml",
    "scripts/db-retention.mjs",
  ]) {
    copyRelative(root, relativePath);
  }
  return root;
}

afterEach(() => {
  while (tempRoots.length) {
    fs.rmSync(tempRoots.pop()!, { recursive: true, force: true });
  }
});

describe("log retention harness contract", () => {
  it("keeps retention policy, runner, scheduler, and harness wiring in lockstep", () => {
    const result = validateLogRetentionHarness(repoRoot);
    expect(result.errors).toEqual([]);
    expect(result.checks.sentinelChecks).toBeGreaterThanOrEqual(2);
    expect(result.checks.repoScheduleWired).toBe(true);
  });

  it("never promotes repository wiring to live retention proof", () => {
    const contract = loadJson(repoRoot, ".ai/log-retention-contract.json");
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
      const root = fixtureRoot();
      const contractPath = ".ai/log-retention-contract.json";
      const original = loadJson(root, contractPath);
      const dupe = { ...original.criticalSentinels[0], id: "dupe" };
      saveJson(root, contractPath, { ...original, criticalSentinels: [original.criticalSentinels[0], dupe] });
      const result = validateLogRetentionHarness(root);
      expect(result.errors.some((e) => e.includes("duplicate table+column pairs"))).toBe(true);
    });

    it("rejects missing required sentinel (security_events.created_at)", () => {
      const root = fixtureRoot();
      const contractPath = ".ai/log-retention-contract.json";
      const original = loadJson(root, contractPath);
      saveJson(root, contractPath, {
        ...original,
        criticalSentinels: original.criticalSentinels.filter(
          (s: { table: string; column: string }) => !(s.table === "security_events" && s.column === "created_at"),
        ),
      });
      const result = validateLogRetentionHarness(root);
      expect(result.errors.some((e) => e.includes("security_events.created_at is required"))).toBe(true);
    });

    it("rejects missing required sentinel (foundry_run_logs.created_at)", () => {
      const root = fixtureRoot();
      const contractPath = ".ai/log-retention-contract.json";
      const original = loadJson(root, contractPath);
      saveJson(root, contractPath, {
        ...original,
        criticalSentinels: original.criticalSentinels.filter(
          (s: { table: string; column: string }) => !(s.table === "foundry_run_logs" && s.column === "created_at"),
        ),
      });
      const result = validateLogRetentionHarness(root);
      expect(result.errors.some((e) => e.includes("foundry_run_logs.created_at is required"))).toBe(true);
    });

    it("rejects registry entry with wrong command field", () => {
      const root = fixtureRoot();
      const validatorPath = ".ai/validator-registry.json";
      const original = loadJson(root, validatorPath);
      const entry = original.validators.find((v: { id: string }) => v.id === "log-retention");
      entry.command = "node wrong/path.mjs";
      saveJson(root, validatorPath, original);
      const result = validateLogRetentionHarness(root);
      expect(result.errors.some((e) => e.includes("log-retention") && e.includes("command expected"))).toBe(true);
    });

    it("rejects registry entry with wrong workflow path", () => {
      const root = fixtureRoot();
      const workflowPath = ".ai/workflow-registry.json";
      const original = loadJson(root, workflowPath);
      const entry = original.workflows.find((w: { id: string }) => w.id === "axtask.log-retention-capacity-defense.v1");
      entry.path = ".ai/wrong/path.md";
      saveJson(root, workflowPath, original);
      const result = validateLogRetentionHarness(root);
      expect(result.errors.some((e) => e.includes("log-retention-capacity-defense") && e.includes("path expected"))).toBe(true);
    });

    it("rejects registry entry with wrong artifact producer", () => {
      const root = fixtureRoot();
      const artifactPath = ".ai/artifact-registry.json";
      const original = loadJson(root, artifactPath);
      const entry = original.artifacts.find((a: { id: string }) => a.id === "log-retention-proof");
      entry.producer = "wrong.workflow.id";
      saveJson(root, artifactPath, original);
      const result = validateLogRetentionHarness(root);
      expect(result.errors.some((e) => e.includes("log-retention-proof") && e.includes("producer expected"))).toBe(true);
    });

    it("rejects registry entry with wrong trigger workflowId", () => {
      const root = fixtureRoot();
      const triggerPath = ".ai/trigger-registry.json";
      const original = loadJson(root, triggerPath);
      const entry = original.triggers.find((t: { id: string }) => t.id === "log-retention-risk");
      entry.workflowId = "wrong.workflow.id";
      saveJson(root, triggerPath, original);
      const result = validateLogRetentionHarness(root);
      expect(result.errors.some((e) => e.includes("log-retention-risk") && e.includes("workflowId expected"))).toBe(true);
    });

    it("rejects commented-out runner entry as executable", () => {
      const root = fixtureRoot();
      const runnerPath = path.join(root, "scripts", "db-retention.mjs");
      const original = fs.readFileSync(runnerPath, "utf8");
      const commented = original.replace(
        '{ table: "security_events",           column: "created_at", window: "90 days"  }',
        '// { table: "security_events",           column: "created_at", window: "90 days"  }',
      );
      fs.writeFileSync(runnerPath, commented);
      const result = validateLogRetentionHarness(root);
      expect(result.errors.some((e) => e.includes("retention runner missing contract entry: security_events") || e.includes("untracked entry"))).toBe(true);
    });

    it("rejects policy table with wrong window as matching", () => {
      const root = fixtureRoot();
      const policyPath = path.join(root, "docs", "DB_RETENTION_POLICY.md");
      const original = fs.readFileSync(policyPath, "utf8");
      const modified = original.replace(
        "| `security_events`             | `created_at`| 90 days",
        "| `security_events`             | `created_at`| 999 days",
      );
      fs.writeFileSync(policyPath, modified);
      const result = validateLogRetentionHarness(root);
      expect(result.errors.some((e) => e.includes("retention policy missing security_events.created_at"))).toBe(true);
    });
  });
});
