import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readText } from "../../scripts/ai-harness/validate-harness.mjs";
import { validateHarnessInfrastructure } from "../../scripts/ai-harness/validate-harness-infrastructure.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8"));
}

function readRenderContract() {
  const text = fs.readFileSync(path.join(REPO_ROOT, "render.yaml"), "utf8");
  const autoDeployMatch = text.match(/^\s*autoDeploy:\s*(true|false)\s*$/m);
  const branchMatch = text.match(/^\s*branch:\s*([^#\s]+)\s*$/m);
  if (!autoDeployMatch) throw new Error("render.yaml must declare autoDeploy explicitly");
  return {
    autoDeploy: autoDeployMatch[1] === "true",
    explicitBranch: branchMatch?.[1] ?? null,
  };
}

describe("AI harness infrastructure completeness", () => {
  it("validates the complete operational harness", () => {
    expect(validateHarnessInfrastructure(REPO_ROOT)).toMatchObject({
      authorityId: "axtask.agent-authority.v1",
      harnessId: "axtask.repo-harness.v1",
      errors: [],
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
    for (const id of ["install", "development", "typecheck", "test", "build", "deploy-contract", "production-start"]) expect(commandIds.has(id)).toBe(true);
    expect(map.configurations.length).toBeGreaterThanOrEqual(8);
    expect(map.knownTraps.length).toBeGreaterThanOrEqual(5);
    expect(map.deploymentModel.directDeployCommandRegistered).toBe(false);
  });

  it("registers the fail-closed main deployment skill chain in execution order", () => {
    const map = readJson(".ai/codebase-map.json");
    const workflows = readJson(".ai/workflow-registry.json");
    const triggers = readJson(".ai/trigger-registry.json");
    const harness = readJson(".ai/harness.json");
    const artifacts = readJson(".ai/artifact-registry.json");

    for (const skillId of [
      "axtask.skill.deploy-readiness.v1",
      "axtask.skill.predeploy-security-review.v1",
      "axtask.skill.authorized-main-deploy.v1",
      "axtask.skill.post-deploy-canary.v1",
    ]) {
      expect(harness.skills).toContain(skillId);
    }

    expect(workflows.workflows).toContainEqual(expect.objectContaining({
      id: "axtask.main-branch-deployment.v1",
      path: ".ai/workflows/main-branch-deployment.md",
    }));
    expect(triggers.triggers).toContainEqual(expect.objectContaining({
      id: "main-branch-deployment-requested",
      workflowId: "axtask.main-branch-deployment.v1",
    }));
    expect(triggers.triggers).toContainEqual(expect.objectContaining({
      id: "authorized-main-deploy-requested",
      skillId: "axtask.skill.authorized-main-deploy.v1",
      condition: expect.stringContaining("predeploy-security-review disposition of CLEAR"),
    }));
    expect(triggers.triggers).toContainEqual(expect.objectContaining({
      id: "post-deploy-verification-requested",
      skillId: "axtask.skill.post-deploy-canary.v1",
    }));

    const render = readRenderContract();
    expect(render.autoDeploy).toBe(true);
    expect(render.explicitBranch).toBeNull();
    expect(map.deploymentModel.autoDeploy).toBe(render.autoDeploy);
    expect(map.deploymentModel.autoDeploySource).toBe("render.yaml");
    expect(map.deploymentModel.renderBranchOverride).toBe(render.explicitBranch);
    expect(map.deploymentModel.productionBranch).toBe("main");
    expect(map.deploymentModel.productionBranchSource).toContain("repository release contract");

    const ship = map.commands.find((command: { id: string }) => command.id === "ship");
    expect(ship).toMatchObject({
      id: "ship",
      command: "npm run ship -- \"<conventional message>\"",
    });
    expect(ship.role).toContain("rejects main");
    expect(ship.role).toContain("not a deployment-readiness or main-promotion command");
    expect(ship.mutation).toContain("non-main feature branch only");

    const workflowText = fs.readFileSync(path.join(REPO_ROOT, ".ai", "workflows", "main-branch-deployment.md"), "utf8");
    const orderedMarkers = [
      "2. **Security delta**",
      "axtask.skill.predeploy-security-review.v1",
      "3. **Deploy readiness**",
      "axtask.skill.deploy-readiness.v1",
      "4. **Authorization gate**",
      "READY_FOR_AUTHORIZED_DEPLOYMENT",
      "5. **Promotion**",
      "axtask.skill.authorized-main-deploy.v1",
      "6. **Canary**",
      "axtask.skill.post-deploy-canary.v1",
    ];
    let previousIndex = -1;
    for (const marker of orderedMarkers) {
      const index = workflowText.indexOf(marker);
      expect(index, `workflow marker missing: ${marker}`).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
    expect(workflowText).toContain("predeploy-security-review.json");
    expect(workflowText).toContain("disposition `CLEAR`");
    expect(workflowText).toContain("Post-authorization TOCTOU").or.toContain("post-authorization");
    expect(workflowText).toContain("LIVE_SHA_UNVERIFIED");
    expect(workflowText).toContain("```mermaid");
    expect(workflowText).toContain("## Diagnosis note");
    expect(workflowText).toContain("## Testing note");
    expect(workflowText).toContain("## Rollout note");
    expect(workflowText).toContain("## Rollback / recovery note");

    expect(artifacts.artifacts).toContainEqual(expect.objectContaining({
      id: "predeploy-security-review",
      producer: "axtask.skill.predeploy-security-review.v1",
      schema: ".ai/schemas/predeploy-security-review-result.schema.json",
      tracked: false,
      sanitized: true,
    }));
    expect(fs.existsSync(path.join(REPO_ROOT, ".ai", "schemas", "predeploy-security-review-result.schema.json"))).toBe(true);
  });

  it("blocks the convenience ship wrapper on main before staging", () => {
    const shipScript = fs.readFileSync(path.join(REPO_ROOT, "scripts", "ship.ps1"), "utf8");
    const branchIndex = shipScript.indexOf("git branch --show-current");
    const mainGuardIndex = shipScript.indexOf('$branch -eq "main"');
    const addIndex = shipScript.indexOf("git add .");
    const pushIndex = shipScript.indexOf("git push -u origin $branch");

    expect(branchIndex).toBeGreaterThanOrEqual(0);
    expect(mainGuardIndex).toBeGreaterThan(branchIndex);
    expect(addIndex).toBeGreaterThan(mainGuardIndex);
    expect(pushIndex).toBeGreaterThan(addIndex);
    expect(shipScript).toContain("feature branch + reviewed PR");
  });

  it("registers how every artifact is produced and named", () => {
    const registry = readJson(".ai/artifact-registry.json");
    const ids = new Set(registry.artifacts.map((artifact: { id: string }) => artifact.id));
    for (const id of ["run-context", "repo-snapshot", "validator-plan", "runtime-proof", "failure-report", "operator-report", "final-handoff", "release-evidence", "prompt", "predeploy-security-review"]) expect(ids.has(id)).toBe(true);
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

  it("keeps hooks opt-in while providing commit and push guards", () => {
    const harness = readJson(".ai/harness.json");
    const preCommit = fs.readFileSync(path.join(REPO_ROOT, ".githooks", "pre-commit"), "utf8");
    const prePush = fs.readFileSync(path.join(REPO_ROOT, ".githooks", "pre-push"), "utf8");
    expect(harness.hookPolicy.automaticInstall).toBe(false);
    expect(harness.hookPolicy.preCommitRuns).toContain("harness");
    expect(harness.hookPolicy.prePushRuns).toContain("harness-infrastructure");
    expect(harness.hookPolicy.prePushRuns).toContain("harness-tests");
    expect(preCommit).toContain("validate-harness.mjs");
    expect(prePush).toContain("validate-harness-infrastructure.mjs");
    expect(prePush).toContain("harness-infrastructure-contract.test.ts");
    expect(prePush).toContain("--no-install");
  });

  it("enforces operator-report headings and sanitization markers", () => {
    const report = fs.readFileSync(path.join(REPO_ROOT, ".ai", "reports", "failure-report-template.md"), "utf8");
    for (const heading of ["## FAILURE", "## CLASSIFICATION", "## REPRODUCTION", "## OWNERSHIP", "## ATTEMPTS", "## VALIDATION STATE", "## REPAIR OR BLOCKER", "## NEXT OWNER"]) expect(report).toContain(heading);
    expect(report).toContain("Do not include raw logs");
  });
});
