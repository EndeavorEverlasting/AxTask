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
  it("selects harness contracts for harness changes", () => {
    const plan = selectValidators(REGISTRY, {
      changedPaths: [".ai/validator-registry.json", "scripts/ai-harness/select-validators.mjs"],
    });

    expect(ids(plan)).toEqual([
      "authority",
      "harness",
      "harness-tests",
      "release",
      "tests",
    ]);
    expect(plan.executionPolicy).toContain("not executed");
  });

  it("selects deploy contracts and their broad prerequisites", () => {
    const plan = selectValidators(REGISTRY, { changedPaths: ["render.yaml"] });

    expect(ids(plan)).toEqual(["release", "typecheck", "tests", "build", "deploy"]);
    expect(plan.unmatchedPaths).toEqual([]);
  });

  it("keeps docs-only work bounded to the release contract", () => {
    const plan = selectValidators(REGISTRY, { changedPaths: ["docs/AI_HARNESS.md"] });

    expect(ids(plan)).toEqual(["release"]);
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

    expect(ids(plan)).toEqual(["authority", "harness", "run-context", "release"]);
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
});
