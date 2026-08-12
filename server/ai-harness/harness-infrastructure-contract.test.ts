import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readText } from "../../scripts/ai-harness/validate-harness.mjs";
import { validateHarnessInfrastructure } from "../../scripts/ai-harness/validate-harness-infrastructure.mjs";
import { validateLocalCertHarness } from "../../scripts/ai-harness/validate-local-cert-harness.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

describe("AI harness infrastructure completeness", () => {
  it("validates the complete operational harness", () => {
    expect(validateHarnessInfrastructure(REPO_ROOT)).toMatchObject({
      authorityId: "axtask.agent-authority.v1",
      harnessId: "axtask.repo-harness.v1",
      errors: [],
    });
  });

  it("validates the local-cert runtime-proof harness slice", () => {
    expect(validateLocalCertHarness(REPO_ROOT)).toEqual({
      errors: [],
      componentsChecked: 6,
    });
  });

  it("returns structured errors for malformed component paths", () => {
    const errors: string[] = [];
    expect(readText(REPO_ROOT, undefined as unknown as string, errors)).toBe("");
    expect(errors).toEqual(["missing text path"]);
  });

  it("maps repository commands, configurations, and known traps", () => {
    const map = readJson(".ai/codebase-map.json");
    const commandIds = new Set(map.commands.map((command: { id: string }) => command.id));
    for (const id of ["install", "development", "typecheck", "test", "build", "deploy-contract", "production-start", "local-certification", "runtime-proof-validate", "local-cert-harness-validate"]) expect(commandIds.has(id)).toBe(true);
    expect(map.configurations.length).toBeGreaterThanOrEqual(8);
    expect(map.knownTraps.length).toBeGreaterThanOrEqual(5);
    expect(map.knownTraps).toContain("A local-cert report is not live deployment proof: validate its sibling runtime-proof.json and honor proofCeiling before making deployment claims.");
    expect(map.deploymentModel.directDeployCommandRegistered).toBe(false);
  });

  it("registers how every artifact is produced and named", () => {
    const registry = readJson(".ai/artifact-registry.json");
    const ids = new Set(registry.artifacts.map((artifact: { id: string }) => artifact.id));
    for (const id of ["run-context", "repo-snapshot", "validator-plan", "runtime-proof", "local-cert-report", "failure-report", "operator-report", "final-handoff", "release-evidence", "prompt"]) expect(ids.has(id)).toBe(true);
    for (const artifact of registry.artifacts) {
      expect(artifact.pathPattern).toBeTruthy();
      expect(typeof artifact.tracked).toBe("boolean");
      expect(typeof artifact.sanitized).toBe("boolean");
      expect(artifact.producer).toBeTruthy();
      expect(artifact.generation).toBeTruthy();
      expect(artifact.namingConvention).toBeTruthy();
    }
  });

  it("routes validator and workflow failures to a scoped recovery procedure", () => {
    const workflows = readJson(".ai/workflow-registry.json");
    const triggers = readJson(".ai/trigger-registry.json");
    const harness = readJson(".ai/harness.json");
    expect(workflows.workflows).toContainEqual(expect.objectContaining({id: "axtask.failure-recovery.v1", path: ".ai/workflows/failure-recovery.md"}));
    expect(triggers.triggers).toContainEqual(expect.objectContaining({id: "validator-or-workflow-failed", workflowId: "axtask.failure-recovery.v1"}));
    expect(harness.skills).toContain("axtask.skill.failure-recovery.v1");
  });

  it("registers local certification, runtime proof, and their validators", () => {
    const harness = readJson(".ai/harness.json");
    const validators = readJson(".ai/validator-registry.json");
    const workflows = readJson(".ai/workflow-registry.json");
    expect(harness.components).toContainEqual(expect.objectContaining({id: "local-cert-harness-validator", path: "scripts/ai-harness/validate-local-cert-harness.mjs"}));
    expect(harness.components).toContainEqual(expect.objectContaining({id: "runtime-proof-validator", path: "scripts/ai-harness/validate-runtime-proof.mjs"}));
    expect(harness.components).toContainEqual(expect.objectContaining({id: "local-cert-contract-test", path: "server/ai-harness/local-production-certification-contract.test.ts"}));
    expect(validators.validators).toContainEqual(expect.objectContaining({id: "local-cert-harness", command: "node scripts/ai-harness/validate-local-cert-harness.mjs"}));
    expect(validators.validators).toContainEqual(expect.objectContaining({id: "runtime-proof"}));
    expect(validators.validators).toContainEqual(expect.objectContaining({id: "local-production-certification"}));
    expect(workflows.workflows).toContainEqual(expect.objectContaining({id: "axtask.local-deployment-certification.v1", path: ".ai/workflows/local-deployment-certification.md"}));
  });

  it("keeps hooks opt-in while providing commit and push guards", () => {
    const harness = readJson(".ai/harness.json");
    const preCommit = fs.readFileSync(path.join(REPO_ROOT, ".githooks", "pre-commit"), "utf8");
    const prePush = fs.readFileSync(path.join(REPO_ROOT, ".githooks", "pre-push"), "utf8");
    expect(harness.hookPolicy.automaticInstall).toBe(false);
    expect(harness.hookPolicy.preCommitRuns).toContain("harness");
    expect(harness.hookPolicy.prePushRuns).toContain("harness-infrastructure");
    expect(harness.hookPolicy.prePushRuns).toContain("local-cert-harness");
    expect(harness.hookPolicy.prePushRuns).toContain("harness-tests");
    expect(preCommit).toContain("validate-harness.mjs");
    expect(prePush).toContain("validate-harness-infrastructure.mjs");
    expect(prePush).toContain("validate-local-cert-harness.mjs");
    expect(prePush).toContain("harness-infrastructure-contract.test.ts");
    expect(prePush).toContain("local-production-certification-contract.test.ts");
    expect(prePush).toContain("--no-install");
  });

  it("enforces operator-report headings and sanitization markers", () => {
    const report = fs.readFileSync(path.join(REPO_ROOT, ".ai", "reports", "failure-report-template.md"), "utf8");
    for (const heading of ["## FAILURE", "## CLASSIFICATION", "## REPRODUCTION", "## OWNERSHIP", "## ATTEMPTS", "## VALIDATION STATE", "## REPAIR OR BLOCKER", "## NEXT OWNER"]) expect(report).toContain(heading);
    expect(report).toContain("Do not include raw logs");
  });

  it("requires runtime proof in operator reports without proof escalation", () => {
    const report = fs.readFileSync(path.join(REPO_ROOT, ".ai", "reports", "operator-report-template.md"), "utf8");
    expect(report).toContain("## RUNTIME PROOF");
    expect(report).toContain("runtime-proof.json");
    expect(report).toContain("local-cert-report.md");
    expect(report).toContain("proof ceiling");
    expect(report).toContain("Never promote local-runtime proof");
  });
});
