// @vitest-environment node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-ignore repository harness executable is ESM JavaScript
import {
  checkRuntimeFailureSummaryFile,
  summarizeRuntimeFailureFile,
} from "../../scripts/ai-harness/summarize-runtime-failure.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function proof(overrides: Record<string, unknown> = {}) {
  return {
    schemaId: "axtask.runtime-proof.v1",
    authorityRef: "axtask.agent-authority.v1",
    candidateSha: "a67ac64bdab80c394ba9b24c7d1c31fa251ff05d",
    environmentClass: "local",
    commands: ["local-cert"],
    timestamps: { startedAt: "2026-08-12T20:00:00Z", finishedAt: "2026-08-12T20:01:00Z" },
    assertions: [
      { id: "local-allow-marker", description: "local allow marker", passed: true, evidence: "present" },
      { id: "ready-http", description: "/ready returned HTTP 200", passed: false, evidence: "sanitized internal evidence" },
    ],
    failures: [{ id: "ready-http", description: "/ready did not return HTTP 200", severity: "blocking" }],
    skippedEvidence: [],
    attainedProofLevel: "launcher",
    proofCeiling: "local-runtime",
    operatorAcceptance: { accepted: false, reason: "local certification only" },
    ...overrides,
  };
}

describe("runtime failure summary harness", () => {
  it("turns a schema-valid NO_GO proof into deterministic sanitized machine and operator artifacts", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-runtime-failure-"));
    try {
      const proofPath = path.join(scratch, "runtime-proof.json");
      fs.writeFileSync(proofPath, `${JSON.stringify(proof(), null, 2)}\n`, "utf8");
      const result = summarizeRuntimeFailureFile(REPO_ROOT, proofPath);
      expect(result.summary.status).toBe("NO_GO");
      expect(result.summary.classification).toBe("runtime");
      expect(result.summary.primaryFailure).toMatchObject({ id: "ready-http", source: "failure" });
      expect(result.summary.nextWorkflow).toBe("axtask.failure-recovery.v1");
      expect(result.summary.retryPolicy).toBe("do-not-retry-unchanged");
      expect(fs.existsSync(result.summaryPath)).toBe(true);
      expect(fs.existsSync(result.reportPath)).toBe(true);
      const serialized = fs.readFileSync(result.summaryPath, "utf8");
      expect(serialized).not.toContain("sanitized internal evidence");
      expect(checkRuntimeFailureSummaryFile(REPO_ROOT, result.summaryPath).candidateSha).toBe(proof().candidateSha);
      const report = fs.readFileSync(result.reportPath, "utf8");
      expect(report).toContain("## PRIMARY FAILURE");
      expect(report).toContain("`ready-http`");
      expect(report).toContain("do-not-retry-unchanged");
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("does not manufacture a failure when the proof contains none", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-runtime-no-failure-"));
    try {
      const proofPath = path.join(scratch, "runtime-proof.json");
      fs.writeFileSync(proofPath, `${JSON.stringify(proof({
        assertions: [{ id: "health-http", description: "/health returned HTTP 200", passed: true, evidence: "200" }],
        failures: [],
        attainedProofLevel: "local-runtime",
      }), null, 2)}\n`, "utf8");
      const result = summarizeRuntimeFailureFile(REPO_ROOT, proofPath);
      expect(result.summary.status).toBe("NO_FAILURES");
      expect(result.summary.classification).toBe("none");
      expect(result.summary.primaryFailure).toBeNull();
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
});
