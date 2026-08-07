// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-ignore The repository harness is intentionally implemented as an executable ESM .mjs module.
import { classifyChangedPaths, evaluatePredeployReadiness } from "../../scripts/ai-harness/evaluate-predeploy-readiness.mjs";

const SHA = "a".repeat(40);

function base(overrides: Record<string, unknown> = {}) {
  return {
    currentMainSha: SHA,
    candidateSha: SHA,
    repositoryClean: true,
    blockingPrCount: 0,
    ciGreen: true,
    backupStatus: "PASS_ACCOUNT_ROUNDTRIP",
    schemaStatus: "NOT_REQUIRED",
    buildStatus: "PASS",
    runtimeStatus: "UNKNOWN",
    changedPaths: ["server/routes/account-backup.ts"],
    ...overrides,
  };
}

describe("predeploy readiness evaluator", () => {
  it("classifies docs/harness-only changes as no-deploy-needed without inventing provider cost", () => {
    const result = evaluatePredeployReadiness(
      base({
        changedPaths: ["docs/releases/2026-07-31-note.md", ".ai/workflows/pr-closeout.md"],
        backupStatus: "NOT_REQUIRED",
        buildStatus: "NOT_REQUIRED",
      }),
    );

    expect(result.deploymentNeeded).toBe(false);
    expect(result.verdict).toBe("READY_FOR_LOCAL_ACCEPTANCE");
    expect(result.recommendation).toBe("NO_DEPLOY_NEEDED");
    expect(result.costEvidence).toMatchObject({
      classification: "NONE_NO_DEPLOY_NEEDED",
      monetaryEstimate: null,
    });
  });

  it("requires account round-trip proof before runtime-affecting deployment work", () => {
    const result = evaluatePredeployReadiness(base({ backupStatus: "MISSING" }));
    expect(result.verdict).toBe("NOT_READY_BACKUP");
    expect(result.missingGates.map((gate: { name: string }) => gate.name)).toContain("account-backup-roundtrip");
  });

  it("requires migration safety for schema-affecting changes", () => {
    const result = evaluatePredeployReadiness(
      base({
        changedPaths: ["migrations/0043_example.sql", "shared/schema.ts"],
        schemaStatus: "FAIL",
      }),
    );
    expect(result.verdict).toBe("NOT_READY_SCHEMA");
    expect(result.runtimeImpact.schemaAffecting).toHaveLength(2);
  });

  it("routes a repository-green runtime candidate to local acceptance when runtime proof is unknown", () => {
    const result = evaluatePredeployReadiness(base());
    expect(result.verdict).toBe("READY_FOR_LOCAL_ACCEPTANCE");
    expect(result.recommendation).toBe("RUN_LOCAL_PRODUCTION_CERTIFICATION");
  });

  it("allows authorized-deployment readiness only after local runtime proof passes", () => {
    const result = evaluatePredeployReadiness(base({ runtimeStatus: "PASS" }));
    expect(result.verdict).toBe("READY_FOR_AUTHORIZED_DEPLOYMENT");
    expect(result.recommendation).toBe("AWAIT_EXPLICIT_DEPLOYMENT_AUTHORIZATION");
    expect(result.proofCeiling).toBe("repository-evidence");
  });

  it("allows a current pre-merge PR candidate without requiring it to equal main", () => {
    const candidateSha = "b".repeat(40);
    const result = evaluatePredeployReadiness(
      base({
        candidateSha,
        currentCandidateSha: candidateSha,
        baseSha: SHA,
        runtimeStatus: "PASS",
      }),
    );

    expect(result.verdict).toBe("READY_FOR_AUTHORIZED_DEPLOYMENT");
    expect(result.currentCandidateSha).toBe(candidateSha);
    expect(result.currentMainSha).toBe(SHA);
    expect(result.baseSha).toBe(SHA);
    expect(result.missingGates).toEqual([]);
  });

  it("blocks a stale PR head before authorization", () => {
    const result = evaluatePredeployReadiness(
      base({
        candidateSha: "b".repeat(40),
        currentCandidateSha: "c".repeat(40),
        baseSha: SHA,
        runtimeStatus: "PASS",
      }),
    );

    expect(result.verdict).toBe("NOT_READY_REPOSITORY");
    expect(result.missingGates.map((gate: { name: string }) => gate.name)).toContain("candidate-current");
  });

  it("blocks when main moves after the recorded candidate base", () => {
    const candidateSha = "b".repeat(40);
    const result = evaluatePredeployReadiness(
      base({
        currentMainSha: "c".repeat(40),
        baseSha: SHA,
        candidateSha,
        currentCandidateSha: candidateSha,
        runtimeStatus: "PASS",
      }),
    );

    expect(result.verdict).toBe("NOT_READY_REPOSITORY");
    expect(result.missingGates.map((gate: { name: string }) => gate.name)).toContain("base-current");
  });

  it("blocks stale legacy candidates and open PR floors before later gates", () => {
    const result = evaluatePredeployReadiness(
      base({ candidateSha: "b".repeat(40), blockingPrCount: 2, ciGreen: false }),
    );
    expect(result.verdict).toBe("NOT_READY_REPOSITORY");
    expect(result.missingGates.map((gate: { name: string }) => gate.name)).toEqual(
      expect.arrayContaining(["no-blocking-prs", "candidate-current", "required-ci"]),
    );
  });

  it("separates application, schema, and deployment configuration impact", () => {
    const impact = classifyChangedPaths([
      "client/src/App.tsx",
      "migrations/0043_example.sql",
      "render.yaml",
      "docs/README.md",
    ]);
    expect(impact.runtimeAffecting).toHaveLength(3);
    expect(impact.schemaAffecting).toEqual(["migrations/0043_example.sql"]);
    expect(impact.deploymentConfigAffecting).toEqual(["render.yaml"]);
  });
});
