import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { validateRunContextFile } from "../../scripts/ai-harness/validate-run-context.mjs";
import { validateRuntimeProofFile } from "../../scripts/ai-harness/validate-runtime-proof.mjs";
import {
  duplicateIds,
  validateHarnessContract,
  validateTriggerRoutes,
} from "../../scripts/ai-harness/validate-harness.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");
const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

function makeTempRun(runId: string) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-p07-"));
  tempDirs.push(tempDir);
  const runDir = path.join(tempDir, ".ai", "runs", runId);
  fs.mkdirSync(runDir, { recursive: true });
  return { runDir };
}

function writeContext(runDir: string, overrides: Record<string, unknown>) {
  const context = {
    authorityRef: "axtask.agent-authority.v1",
    schemaId: "axtask.run-context.v1",
    workflowId: "axtask.local-deployment-certification.v1",
    ownerRole: "deployment-certification",
    activationReason: "local certification requested",
    repoRoot: "/workspace/EndeavorEverlasting/AxTask",
    branch: "feat/2026-07-deployment-certification-spine",
    head: "0000000000000000000000000000000000000000",
    baseRef: "origin/main",
    environmentClass: "local",
    candidateSha: "0000000000000000000000000000000000000000",
    ownedScope: [".ai/**"],
    forbiddenScope: ["render.yaml", "package.json"],
    expectedArtifacts: [".ai/runs/p07-sample/context.json"],
    likelyFiles: [".ai/runtime-proof.schema.json"],
    collisionFiles: [],
    selectedSkills: ["axtask.skill.runtime-proof.v1"],
    selectedCapabilities: ["runtime-proof-recording"],
    selectedTriggers: ["local-certification-requested"],
    preconditions: ["isolated worktree"],
    forbiddenConditions: ["production database"],
    targetedValidators: ["run-context", "runtime-proof"],
    validation: ["node scripts/ai-harness/validate-run-context.mjs"],
    requiredProofLevels: ["contract", "harness"],
    attainedProofLevels: ["contract", "harness"],
    proofCeiling: "local-runtime",
    ...overrides,
  };
  const filePath = path.join(runDir, "context.json");
  fs.writeFileSync(filePath, JSON.stringify(context, null, 2), "utf8");
  return filePath;
}

function writeProof(runDir: string, overrides: Record<string, unknown>) {
  const proof = {
    authorityRef: "axtask.agent-authority.v1",
    schemaId: "axtask.runtime-proof.v1",
    candidateSha: "0000000000000000000000000000000000000000",
    environmentClass: "local",
    commands: ["npm run build"],
    timestamps: { startedAt: "2026-07-20T00:00:00Z", finishedAt: "2026-07-20T00:05:00Z" },
    sanitizedArtifacts: [".ai/runs/p07-sample/build-summary.json"],
    assertions: [{ id: "build", description: "build passes", passed: true, evidence: "exit 0" }],
    failures: [],
    skippedEvidence: [],
    attainedProofLevel: "local-runtime",
    proofCeiling: "local-runtime",
    operatorAcceptance: { accepted: false },
    ...overrides,
  };
  const filePath = path.join(runDir, "runtime-proof.json");
  fs.writeFileSync(filePath, JSON.stringify(proof, null, 2), "utf8");
  return filePath;
}

describe("AI harness deployment certification contract", () => {
  it("validates a complete harness with deployment registries", () => {
    expect(validateHarnessContract(REPO_ROOT)).toMatchObject({
      authorityId: "axtask.agent-authority.v1",
      harnessId: "axtask.repo-harness.v1",
      errors: [],
    });
  });

  it("rejects a run context without an owner role", () => {
    const { runDir } = makeTempRun("missing-owner");
    const filePath = writeContext(runDir, { ownerRole: undefined });
    expect(validateRunContextFile(REPO_ROOT, filePath).errors).toContainEqual(
      expect.stringContaining("missing required field ownerRole"),
    );
  });

  it("rejects run-context arrays supplied as strings", () => {
    const { runDir } = makeTempRun("bad-array");
    const filePath = writeContext(runDir, { selectedCapabilities: "runtime-proof-recording" });
    expect(validateRunContextFile(REPO_ROOT, filePath).errors).toContainEqual(
      expect.stringContaining("selectedCapabilities must be an array"),
    );
  });

  it("rejects a run context referencing an unknown capability", () => {
    const { runDir } = makeTempRun("unknown-capability");
    const filePath = writeContext(runDir, { selectedCapabilities: ["not-registered"] });
    expect(validateRunContextFile(REPO_ROOT, filePath).errors).toContainEqual(
      expect.stringContaining("unknown capability not-registered"),
    );
  });

  it("detects an injected duplicate capability id", () => {
    expect(duplicateIds([{ id: "same" }, { id: "same" }])).toEqual(["same"]);
  });

  it("detects an injected duplicate trigger id", () => {
    expect(duplicateIds([{ id: "same-trigger" }, { id: "same-trigger" }])).toEqual(["same-trigger"]);
  });

  it("rejects a trigger pointing to an unknown workflow", () => {
    const errors = validateTriggerRoutes(
      [{ id: "bad-route", workflowId: "missing.workflow" }],
      new Set(["known.workflow"]),
      new Set<string>(),
      new Set<string>(),
    );
    expect(errors).toContain("trigger bad-route references unknown workflow missing.workflow");
  });

  it("rejects a trigger with multiple route owners", () => {
    const errors = validateTriggerRoutes(
      [{ id: "ambiguous", workflowId: "known.workflow", skillId: "known.skill" }],
      new Set(["known.workflow"]),
      new Set(["known.skill"]),
      new Set<string>(),
    );
    expect(errors).toContain(
      "trigger ambiguous must define exactly one workflowId, skillId, or capabilityId",
    );
  });

  it("rejects runtime proof claiming deployment without live identifiers", () => {
    const { runDir } = makeTempRun("deployment-without-id");
    const filePath = writeProof(runDir, {
      environmentClass: "live",
      attainedProofLevel: "deployment-completion",
      proofCeiling: "deployment-completion",
      observedEndpoints: [],
    });
    const errors = validateRuntimeProofFile(REPO_ROOT, filePath).errors;
    expect(errors).toContainEqual(expect.stringContaining("deploymentId"));
    expect(errors).toContainEqual(expect.stringContaining("deploymentTimestamp"));
    expect(errors).toContainEqual(expect.stringContaining("observedEndpoints must not be empty"));
  });

  it("rejects local proof claiming a live attained level", () => {
    const { runDir } = makeTempRun("local-claiming-live");
    const filePath = writeProof(runDir, {
      environmentClass: "local",
      attainedProofLevel: "live-runtime",
      proofCeiling: "live-runtime",
    });
    expect(validateRuntimeProofFile(REPO_ROOT, filePath).errors).toContainEqual(
      expect.stringContaining("local environmentClass cannot claim attainedProofLevel live-runtime"),
    );
  });

  it("rejects local proof with an inflated deployment ceiling", () => {
    const { runDir } = makeTempRun("local-inflated-ceiling");
    const filePath = writeProof(runDir, { proofCeiling: "deployment-completion" });
    expect(validateRuntimeProofFile(REPO_ROOT, filePath).errors).toContainEqual(
      expect.stringContaining("local environmentClass cannot claim proofCeiling deployment-completion"),
    );
  });

  it("rejects local-runtime proof with a failed assertion", () => {
    const { runDir } = makeTempRun("failed-runtime-assertion");
    const filePath = writeProof(runDir, {
      assertions: [{ id: "ready", description: "readiness passes", passed: false, evidence: "503" }],
    });
    expect(validateRuntimeProofFile(REPO_ROOT, filePath).errors).toContainEqual(
      expect.stringContaining("runtime proof levels require every assertion to pass"),
    );
  });

  it("rejects tracked raw-log or secret-bearing output in artifact registry", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".ai", "artifact-registry.json"), "utf8"),
    );
    const forbidden = new Set(registry.forbiddenTrackedOutputs);
    expect(forbidden.has("raw runtime logs")).toBe(true);
    expect(forbidden.has("credentials")).toBe(true);
    expect(forbidden.has(".ai/runs/ content")).toBe(true);
  });
});
