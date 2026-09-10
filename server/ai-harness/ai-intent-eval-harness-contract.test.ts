// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(rel: string) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, rel), "utf8"));
}

describe("ai-intent-eval harness wiring", () => {
  it("registers validator, workflow, and artifacts", () => {
    const validators = readJson(".ai/validator-registry.json");
    const workflows = readJson(".ai/workflow-registry.json");
    const artifacts = readJson(".ai/artifact-registry.json");

    const validator = validators.validators.find((v: { id: string }) => v.id === "ai-intent-eval");
    expect(validator?.command).toContain("validate-ai-intent-eval.mjs");
    expect(validator?.required).toBe(true);

    expect(
      workflows.workflows.some((w: { id: string }) => w.id === "axtask.ai-intent-eval.v1"),
    ).toBe(true);

    expect(artifacts.artifacts.some((a: { id: string }) => a.id === "ai-intent-eval")).toBe(true);
    expect(artifacts.artifacts.some((a: { id: string }) => a.id === "ai-intent-eval-baseline")).toBe(
      true,
    );
  });

  it("keeps package script and CI step aligned", () => {
    const pkg = readJson("package.json");
    expect(pkg.scripts["test:ai-eval"]).toContain("run-ai-intent-eval.mjs");

    const workflow = fs.readFileSync(
      path.join(repoRoot, ".github/workflows/test-and-attest.yml"),
      "utf8",
    );
    expect(workflow).toContain("npm run test:ai-eval");
  });
});
