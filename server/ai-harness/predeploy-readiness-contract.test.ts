// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-ignore The repository harness is intentionally implemented as an executable ESM .mjs module.
import {
  buildProductionRecoveryGates,
  classifyChangedPaths,
  evaluatePredeployReadiness,
} from "../../scripts/ai-harness/evaluate-predeploy-readiness.mjs";

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
    productionRecovery: {
      active: false,
      closureEvidence: "operator-proof:incident-closed",
    },
    ...overrides,
  };
}

function completeRecovery() {
  return {
    active: true,
    gates: {
      r0: "PASS",
      r1: "PASS",
      r1_5: "PASS",
      r2: "PASS",
      r3: "PASS",
      r4: "PASS",
      r5: "NOT_REQUIRED",
      r6: "PASS",
      r7: "PASS",
    },
  };
}

describe("predeploy readiness evaluator", () => {
  it("classifies docs/harness-only changes as no-deploy-needed without recovery evidence", () => {
    const result = evaluatePredeployReadiness(
      base({
        changedPaths: [
          "docs/releases/2026-07-31-note.md",
          ".ai/workflows/pr-closeout.md",
        ],
        backupStatus: "NOT_REQUIRED",
        buildStatus: "NOT_REQUIRED",
        productionRecovery: undefined,
      }),
    );

    expect(result.deploymentNeeded).toBe(false);
    expect(result.verdict).toBe("READY_FOR_LOCAL_ACCEPTANCE");
    expect(result.recommendation).toBe("NO_DEPLOY_NEEDED");
  });

  it("requires account round-trip proof before runtime-affecting deployment work", () => {
    expect(
      evaluatePredeployReadiness(base({ backupStatus: "MISSING" })).verdict,
    ).toBe("NOT_READY_BACKUP");
  });

  it("requires migration safety for schema-affecting changes", () => {
    const result = evaluatePredeployReadiness(
      base({
        changedPaths: ["migrations/0043_example.sql", "shared/schema.ts"],
        schemaStatus: "FAIL",
      }),
    );
    expect(result.verdict).toBe("NOT_READY_SCHEMA");
  });

  it("routes a repository-green runtime candidate to local acceptance when runtime proof is unknown", () => {
    const result = evaluatePredeployReadiness(base());
    expect(result.verdict).toBe("READY_FOR_LOCAL_ACCEPTANCE");
    expect(result.recommendation).toBe("RUN_LOCAL_PRODUCTION_CERTIFICATION");
  });

  it("fails closed when recovery evidence is omitted even after local runtime passes", () => {
    const result = evaluatePredeployReadiness(
      base({ runtimeStatus: "PASS", productionRecovery: undefined }),
    );
    expect(result.verdict).toBe("NOT_READY_RECOVERY");
    expect(result.missingGates.map((gate: { name: string }) => gate.name)).toContain(
      "recovery-r1-production-forensics",
    );
  });

  it("keeps deployment blocked when R7 is proven but production recovery gates remain open", () => {
    const result = evaluatePredeployReadiness(
      base({
        runtimeStatus: "PASS",
        productionRecovery: { active: true, gates: { r7: "PASS" } },
      }),
    );
    const missing = result.missingGates.map((gate: { name: string }) => gate.name);

    expect(result.verdict).toBe("NOT_READY_RECOVERY");
    expect(missing).not.toContain("recovery-r7-local-certification");
    expect(missing).toContain("recovery-r1-production-forensics");
  });

  it("allows authorized-deployment readiness only after local runtime and active recovery gates pass", () => {
    const result = evaluatePredeployReadiness(
      base({ runtimeStatus: "PASS", productionRecovery: completeRecovery() }),
    );
    expect(result.verdict).toBe("READY_FOR_AUTHORIZED_DEPLOYMENT");
  });

  it("requires a recognized durable proof token before inactive recovery can authorize deployment", () => {
    const withoutEvidence = evaluatePredeployReadiness(
      base({ runtimeStatus: "PASS", productionRecovery: { active: false } }),
    );
    expect(withoutEvidence.verdict).toBe("NOT_READY_RECOVERY");

    const freeTextEvidence = evaluatePredeployReadiness(
      base({
        runtimeStatus: "PASS",
        productionRecovery: {
          active: false,
          closureEvidence: "incident closed",
        },
      }),
    );
    expect(freeTextEvidence.verdict).toBe("NOT_READY_RECOVERY");

    const withEvidence = evaluatePredeployReadiness(
      base({
        runtimeStatus: "PASS",
        productionRecovery: {
          active: false,
          closureEvidence: "operator-proof:R9-closed",
        },
      }),
    );
    expect(withEvidence.verdict).toBe("READY_FOR_AUTHORIZED_DEPLOYMENT");
  });

  it("accepts NOT_REQUIRED only for optional R5 physical reclaim", () => {
    const recovery = completeRecovery();
    expect(
      buildProductionRecoveryGates(recovery).find(
        (gate: { name: string }) => gate.name === "recovery-r5-physical-reclaim",
      )?.ok,
    ).toBe(true);

    recovery.gates.r4 = "NOT_REQUIRED";
    expect(
      buildProductionRecoveryGates(recovery).find(
        (gate: { name: string }) => gate.name === "recovery-r4-logical-cleanup",
      )?.ok,
    ).toBe(false);
  });

  it("blocks stale candidates and open PR floors before later gates", () => {
    expect(
      evaluatePredeployReadiness(
        base({
          candidateSha: "b".repeat(40),
          blockingPrCount: 2,
          ciGreen: false,
        }),
      ).verdict,
    ).toBe("NOT_READY_REPOSITORY");
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
