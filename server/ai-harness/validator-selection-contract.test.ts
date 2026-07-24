import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ensureOutputPath,
  matchesPattern,
  selectValidators,
} from "../../scripts/ai-harness/select-validators.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");
const REGISTRY = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, ".ai", "validator-registry.json"), "utf8"),
);

function ids(plan: ReturnType<typeof selectValidators>) {
  return plan.validators.map((validator) => validator.id);
}

describe("AI harness validator selection", () => {
  it("registers complete selection metadata and the ignored plan artifact", () => {
    const validatorIds = new Set(REGISTRY.validators.map((validator: { id: string }) => validator.id));
    for (const validator of REGISTRY.validators) {
      expect(
        validator.selection?.always === true ||
          validator.selection?.paths?.length > 0 ||
          validator.selection?.workflows?.length > 0,
      ).toBe(true);
      for (const dependency of validator.requires ?? []) expect(validatorIds.has(dependency)).toBe(true);
    }
    for (const fallbackId of REGISTRY.selectionPolicy.fallbackValidatorIds) {
      expect(validatorIds.has(fallbackId)).toBe(true);
    }

    const artifacts = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, ".ai", "artifact-registry.json"), "utf8"),
    );
    expect(artifacts.artifacts).toContainEqual(
      expect.objectContaining({
        id: "validator-plan",
        pathPattern: ".ai/runs/<run-id>/validator-plan.json",
        tracked: false,
      }),
    );
  });

  it("selects harness contracts for harness changes", () => {
    const plan = selectValidators(REGISTRY, {
      changedPaths: [".ai/validator-registry.json", "scripts/ai-harness/select-validators.mjs"],
    });

    expect(ids(plan)).toEqual([
      "authority",
      "harness",
      "harness-infrastructure",
      "harness-tests",
      "release",
      "tests",
    ]);
    expect(plan.executionPolicy).toContain("not executed");
  });

  it("selects deploy contracts and their broad prerequisites", () => {
    const plan = selectValidators(REGISTRY, { changedPaths: ["render.yaml"] });

    expect(ids(plan)).toEqual(["release", "typecheck", "tests", "build", "deploy", "docs-contracts"]);
    expect(plan.unmatchedPaths).toEqual([]);
  });

  it("keeps docs-only work bounded to docs and release contracts", () => {
    const planGeneric = selectValidators(REGISTRY, { changedPaths: ["docs/GENERAL_NOTE.md"] });
    expect(ids(planGeneric)).toEqual(["release", "tests", "docs-contracts"]);

    const planHarnessDoc = selectValidators(REGISTRY, { changedPaths: ["docs/AI_HARNESS.md"] });
    expect(ids(planHarnessDoc)).toEqual([
      "authority",
      "harness",
      "harness-infrastructure",
      "release",
      "tests",
      "docs-contracts",
    ]);
  });

  it("fails conservative for an unmapped path", () => {
    const plan = selectValidators(REGISTRY, { changedPaths: ["new-root/file.xyz"] });

    expect(ids(plan)).toEqual(["release", "typecheck", "tests", "build"]);
    expect(plan.unmatchedPaths).toEqual(["new-root/file.xyz"]);
  });

  it("adds workflow-specific run-context validation", () => {
    const plan = selectValidators(REGISTRY, {
      changedPaths: ["docs/releases/example.md"],
      workflowId: "axtask.repository-intake.v1",
    });

    expect(ids(plan)).toEqual(["authority", "harness", "run-context", "release", "tests", "docs-contracts"]);
  });

  it("matches Windows paths against repository globs", () => {
    expect(matchesPattern("server\\routes.ts", "server/**")).toBe(true);
    expect(matchesPattern("scripts\\ops\\run.ts", "scripts/**/*.ts")).toBe(true);
  });

  it("rejects output outside the ignored run directory", () => {
    expect(() => ensureOutputPath(REPO_ROOT, "docs/validator-plan.json")).toThrow(
      "output must stay under .ai/runs/",
    );
    expect(ensureOutputPath(REPO_ROOT, ".ai/runs/test/validator-plan.json")).toContain(
      path.join(".ai", "runs", "test", "validator-plan.json"),
    );
  });

  it("rejects a validator dependency that is not registered", () => {
    const invalidRegistry = structuredClone(REGISTRY);
    invalidRegistry.validators[0].requires = ["missing-validator"];

    expect(() =>
      selectValidators(invalidRegistry, { changedPaths: ["AGENTS.md"] }),
    ).toThrow("registry references unknown validator missing-validator");
  });

  it("fails closed when contract impact registry is malformed or invalid", () => {
    const tempDir = fs.mkdtempSync(path.join(REPO_ROOT, ".ai/runs/test-malformed-"));
    try {
      const aiDir = path.join(tempDir, ".ai");
      fs.mkdirSync(aiDir, { recursive: true });
      fs.writeFileSync(path.join(aiDir, "contract-impact-registry.json"), "{ invalid json }", "utf8");
      expect(() =>
        selectValidators(REGISTRY, { changedPaths: ["render.yaml"], rootDir: tempDir }),
      ).toThrow();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
