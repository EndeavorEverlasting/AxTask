// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-ignore The repository harness is intentionally implemented as an executable ESM .mjs module.
import {
  buildProductionRecoveryGates,
  classifyChangedPaths,
  evaluatePredeployReadiness,
} from "../../scripts/ai-harness/evaluate-predeploy-readiness.mjs";

const SHA = "a".repeat(40);
const evidence = (name: string) => `artifact:${name}`;
const record = (status: string, proof: string) => ({ status, evidence: proof });

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
    productionRecovery: {
      active: false,
      closureEvidence: "operator-proof:incident-closed",
    },
    ...overrides,
  };
}

function completeRecovery(candidateSha = SHA) {
  return {
    active: true,
    candidateSha,
    gates: {
      r0: record("PASS", "operator-proof:r0-suspended"),
      r1: record("PASS", evidence("production-audit.json")),
      r1_5: record("PASS", evidence("account-evidence-manifest")),
      r2: record("PASS", evidence("containment-proof")),
      r3: record("PASS", evidence("backup-restore-manifest")),
      r4: record("PASS", evidence("post-cleanup-audit")),
      r5: record("NOT_REQUIRED", evidence("post-cleanup-physical-size")),
      r6: record("PASS", evidence("capacity-policy-result")),
      r7: record("PASS", "workflow:local-cert-run"),
    },
  };
}

describe("predeploy readiness evaluator", () => {
  it("classifies docs/harness-only changes as no-deploy-needed without recovery evidence", () => {
    const result = evaluatePredeployReadiness(base({
      changedPaths: ["docs/releases/2026-07-31-note.md", ".ai/workflows/pr-closeout.md"],
      backupStatus: "NOT_REQUIRED",
      buildStatus: "NOT_REQUIRED",
      productionRecovery: undefined,
    }));
    expect(result.deploymentNeeded).toBe(false);
    expect(result.verdict).toBe("READY_FOR_LOCAL_ACCEPTANCE");
    expect(result.recommendation).toBe("NO_DEPLOY_NEEDED");
  });

  it("requires account round-trip proof before runtime-affecting deployment work", () => {
    expect(evaluatePredeployReadiness(base({ backupStatus: "MISSING" })).verdict).toBe("NOT_READY_BACKUP");
  });

  it("requires migration safety for schema-affecting changes", () => {
    expect(evaluatePredeployReadiness(base({
      changedPaths: ["migrations/0043_example.sql", "shared/schema.ts"],
      schemaStatus: "FAIL",
    })).verdict).toBe("NOT_READY_SCHEMA");
  });

  it("routes a repository-green runtime candidate to local acceptance when runtime proof is unknown", () => {
    const result = evaluatePredeployReadiness(base());
    expect(result.verdict).toBe("READY_FOR_LOCAL_ACCEPTANCE");
    expect(result.recommendation).toBe("RUN_LOCAL_PRODUCTION_CERTIFICATION");
  });

  it("fails closed when recovery evidence is omitted even after local runtime passes", () => {
    const result = evaluatePredeployReadiness(base({ runtimeStatus: "PASS", productionRecovery: undefined }));
    expect(result.verdict).toBe("NOT_READY_RECOVERY");
    expect(result.missingGates.map((gate: { name: string }) => gate.name)).toContain("recovery-r1-production-forensics");
  });

  it("requires every active recovery status to carry durable evidence", () => {
    const recovery = completeRecovery();
    recovery.gates.r1 = { status: "PASS", evidence: "production audit exists" };
    const result = evaluatePredeployReadiness(base({ runtimeStatus: "PASS", productionRecovery: recovery }));
    expect(result.verdict).toBe("NOT_READY_RECOVERY");
    expect(result.missingGates.map((gate: { name: string }) => gate.name)).toContain("recovery-r1-production-forensics");
  });

  it("keeps deployment blocked when only candidate-bound R7 is proven", () => {
    const result = evaluatePredeployReadiness(base({
      runtimeStatus: "PASS",
      productionRecovery: {
        active: true,
        candidateSha: SHA,
        gates: { r7: record("PASS", "workflow:34044694367") },
      },
    }));
    const missing = result.missingGates.map((gate: { name: string }) => gate.name);
    expect(result.verdict).toBe("NOT_READY_RECOVERY");
    expect(missing).not.toContain("recovery-r7-local-certification");
    expect(missing).toContain("recovery-r1-production-forensics");
  });

  it("rejects recovery evidence bound to a different candidate", () => {
    const result = evaluatePredeployReadiness(base({
      runtimeStatus: "PASS",
      productionRecovery: completeRecovery("b".repeat(40)),
    }));
    expect(result.verdict).toBe("NOT_READY_RECOVERY");
    expect(result.missingGates.map((gate: { name: string }) => gate.name)).toContain("recovery-candidate-binding");
  });

  it("requires evidence when R5 is explicitly NOT_REQUIRED", () => {
    const recovery = completeRecovery();
    recovery.gates.r5 = { status: "NOT_REQUIRED", evidence: null };
    expect(buildProductionRecoveryGates(recovery, SHA).find(
      (gate: { name: string }) => gate.name === "recovery-r5-physical-reclaim",
    )?.ok).toBe(false);

    recovery.gates.r5 = record("NOT_REQUIRED", evidence("post-r4-size-proof"));
    expect(buildProductionRecoveryGates(recovery, SHA).find(
      (gate: { name: string }) => gate.name === "recovery-r5-physical-reclaim",
    )?.ok).toBe(true);
  });

  it("allows readiness only after local runtime and candidate-bound recovery evidence pass", () => {
    expect(evaluatePredeployReadiness(base({
      runtimeStatus: "PASS",
      productionRecovery: completeRecovery(),
    })).verdict).toBe("READY_FOR_AUTHORIZED_DEPLOYMENT");
  });

  it("requires operator-controlled production closure proof before inactive recovery can authorize deployment", () => {
    for (const closureEvidence of [
      {},
      "incident closed",
      "workflow:local-certification-123",
      "run:local-certification-123",
      "commit:deadbeef",
    ]) {
      expect(evaluatePredeployReadiness(base({
        runtimeStatus: "PASS",
        productionRecovery: { active: false, closureEvidence },
      })).verdict).toBe("NOT_READY_RECOVERY");
    }

    expect(evaluatePredeployReadiness(base({
      runtimeStatus: "PASS",
      productionRecovery: {
        active: false,
        closureEvidence: "operator-proof:R9-production-incident-closed",
      },
    })).verdict).toBe("READY_FOR_AUTHORIZED_DEPLOYMENT");
  });

  it("does not accept NOT_REQUIRED for non-optional recovery gates", () => {
    const recovery = completeRecovery();
    recovery.gates.r4 = record("NOT_REQUIRED", evidence("cleanup-not-required"));
    expect(buildProductionRecoveryGates(recovery, SHA).find(
      (gate: { name: string }) => gate.name === "recovery-r4-logical-cleanup",
    )?.ok).toBe(false);
  });

  it("blocks stale candidates and open PR floors before later gates", () => {
    expect(evaluatePredeployReadiness(base({
      candidateSha: "b".repeat(40),
      blockingPrCount: 2,
      ciGreen: false,
    })).verdict).toBe("NOT_READY_REPOSITORY");
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
