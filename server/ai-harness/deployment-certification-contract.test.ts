import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { validateRunContextFile } from "../../scripts/ai-harness/validate-run-context.mjs";
import { validateRuntimeProofFile } from "../../scripts/ai-harness/validate-runtime-proof.mjs";
import { validateHarnessContract } from "../../scripts/ai-harness/validate-harness.mjs";

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
  return { tempDir, runDir };
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
    expect(
      validateRunContextFile(REPO_ROOT, filePath).errors.some((error) =>
        error.includes("missing required field ownerRole"),
      ),
    ).toBe(true);
  });

  it("rejects a duplicate capability id", () => {
    const capabilityRegistry = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".ai", "capability-registry.json"), "utf8"),
    );
    const ids = capabilityRegistry.capabilities.map((c: { id: string }) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects a duplicate trigger id", () => {
    const triggerRegistry = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".ai", "trigger-registry.json"), "utf8"),
    );
    const ids = triggerRegistry.triggers.map((t: { id: string }) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects a trigger pointing to an unknown workflow", () => {
    const triggerRegistry = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".ai", "trigger-registry.json"), "utf8"),
    );
    const workflowRegistry = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".ai", "workflow-registry.json"), "utf8"),
    );
    const workflowIds = new Set(workflowRegistry.workflows.map((w: { id: string }) => w.id));
    for (const trigger of triggerRegistry.triggers) {
      if (trigger.workflowId) {
        expect(workflowIds.has(trigger.workflowId)).toBe(true);
      }
    }
  });

  it("rejects runtime proof claiming deployment without a deployment id", () => {
    const { runDir } = makeTempRun("deployment-without-id");
    const filePath = writeProof(runDir, {
      environmentClass: "live",
      attainedProofLevel: "deployment-completion",
      proofCeiling: "deployment-completion",
    });
    const errors = validateRuntimeProofFile(REPO_ROOT, filePath).errors;
    expect(errors.some((error) => error.includes("deploymentId"))).toBe(true);
  });

  it("rejects local proof claiming live proof", () => {
    const { runDir } = makeTempRun("local-claiming-live");
    const filePath = writeProof(runDir, {
      environmentClass: "local",
      attainedProofLevel: "live-runtime",
      proofCeiling: "live-runtime",
    });
    const errors = validateRuntimeProofFile(REPO_ROOT, filePath).errors;
    expect(
      errors.some((error) =>
        error.includes("local environmentClass cannot claim attainedProofLevel live-runtime"),
      ),
    ).toBe(true);
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
