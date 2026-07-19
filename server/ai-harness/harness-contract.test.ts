import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateHarnessContract } from "../../scripts/ai-harness/validate-harness.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");

describe("AI harness control plane", () => {
  it("validates the complete harness", () => {
    expect(validateHarnessContract(REPO_ROOT)).toMatchObject({
      authorityId: "axtask.agent-authority.v1",
      harnessId: "axtask.repo-harness.v1",
      errors: [],
    });
  });

  it("registers every required harness component type", () => {
    const harness = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".ai", "harness.json"), "utf8"),
    );
    const types = new Set(harness.components.map((component: { type: string }) => component.type));
    for (const required of [
      "repo-rules",
      "authority",
      "codebase-map",
      "workflow",
      "run-context",
      "artifact-registry",
      "validator-registry",
      "skill",
      "read-only-intelligence",
      "operator-report",
      "handoff",
      "local-hook",
    ]) {
      expect(types.has(required)).toBe(true);
    }
  });

  it("keeps prompts as artifacts rather than the harness", () => {
    const registry = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".ai", "artifact-registry.json"), "utf8"),
    );
    const prompt = registry.artifacts.find((artifact: { id: string }) => artifact.id === "prompt");
    expect(prompt.note).toContain("not the harness");
  });

  it("keeps hooks opt-in and the inspector read-only", () => {
    const harness = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".ai", "harness.json"), "utf8"),
    );
    expect(harness.hookPolicy.automaticInstall).toBe(false);
    expect(harness.readOnlyIntelligence.mutationAllowed).toBe(false);

    const inspector = fs.readFileSync(
      path.join(REPO_ROOT, "scripts", "ai-harness", "inspect-repo.mjs"),
      "utf8",
    );
    for (const forbidden of ["git reset", "git clean", "git checkout", "git commit", "git push"]) {
      expect(inspector).not.toContain(forbidden);
    }
  });

  it("ignores ephemeral run and generated artifacts", () => {
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf8");
    expect(gitignore).toContain(".ai/runs/");
    expect(gitignore).toContain(".ai/generated/");
  });
});
