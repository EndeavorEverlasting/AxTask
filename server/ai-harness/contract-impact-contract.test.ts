// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ensureOutputPath,
  inspectContractImpact,
  matchesPattern,
} from "../../scripts/ai-harness/inspect-contract-impact.mjs";
import { selectValidators } from "../../scripts/ai-harness/select-validators.mjs";

const root = path.resolve(__dirname, "../..");

describe("contract-impact-registry and inspector contract", () => {
  it("registry exists and parses with valid authorityRef", () => {
    const regPath = path.join(root, ".ai", "contract-impact-registry.json");
    expect(fs.existsSync(regPath)).toBe(true);
    const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
    expect(reg.authorityRef).toBe("axtask.agent-authority.v1");
    expect(Array.isArray(reg.domains)).toBe(true);
    expect(reg.domains.length).toBeGreaterThan(0);
  });

  it("render.yaml maps to deployment-liveness impact domain and dependent docs/tests", () => {
    const result = inspectContractImpact(["render.yaml"]);
    expect(result.matchedDomains).toHaveLength(1);
    const domain = result.matchedDomains[0];
    expect(domain.id).toBe("deployment-liveness");
    expect(result.dependentSurfaces).toContain("docs/DEPLOYMENT_TEST_SUITE.md");
    expect(result.dependentSurfaces).toContain("docs/SCHEDULED_RESOURCE_CONTROLS.md");
    expect(result.dependentSurfaces).toContain("tests/deploy/06-health/health-contract.test.ts");
    expect(result.selectedValidators).toContain("deploy");
    expect(result.selectedValidators).toContain("docs-contracts");
  });

  it("selectValidators incorporates impact-selected validators for render.yaml", () => {
    const valReg = JSON.parse(fs.readFileSync(path.join(root, ".ai", "validator-registry.json"), "utf8"));
    const plan = selectValidators(valReg, { changedPaths: ["render.yaml"] });
    const valIds = plan.validators.map((v) => v.id);
    expect(valIds).toContain("deploy");
    expect(valIds).toContain("docs-contracts");
    const docsVal = plan.validators.find((v) => v.id === "docs-contracts");
    expect(docsVal?.reasons.some((r) => r.includes("contract impact from domain [deployment-liveness]"))).toBe(true);
  });

  it("normalizes Windows backslash paths consistently with POSIX slashes", () => {
    const posixRes = inspectContractImpact(["docs/DEPLOYMENT_TEST_SUITE.md"]);
    const winRes = inspectContractImpact(["docs\\DEPLOYMENT_TEST_SUITE.md"]);
    expect(posixRes.selectedValidators).toEqual(winRes.selectedValidators);
    expect(posixRes.dependentSurfaces).toEqual(winRes.dependentSurfaces);
    expect(winRes.matchedDomains).toHaveLength(1);
    expect(winRes.matchedDomains[0].id).toBe("deployment-liveness");
  });

  it("correctly evaluates globstar pattern matching for nested paths", () => {
    expect(matchesPattern("shared/schema/sub/user.ts", "shared/schema/**/*.ts")).toBe(true);
    expect(matchesPattern("shared\\schema\\deep\\nested\\user.ts", "shared/schema/**/*.ts")).toBe(true);
    const result = inspectContractImpact(["shared/schema/nested/auth.ts"]);
    expect(result.matchedDomains.some((d) => d.id === "schema-migration-contract")).toBe(true);
  });

  it("supports custom --repo-root parameter when inspecting contract impact", () => {
    const runsDir = path.join(root, ".ai", "runs");
    fs.mkdirSync(runsDir, { recursive: true });
    const tempDir = fs.mkdtempSync(path.join(runsDir, "test-root-"));
    try {
      const aiDir = path.join(tempDir, ".ai");
      fs.mkdirSync(aiDir, { recursive: true });
      fs.copyFileSync(
        path.join(root, ".ai", "contract-impact-registry.json"),
        path.join(aiDir, "contract-impact-registry.json"),
      );
      const result = inspectContractImpact(["render.yaml"], { rootDir: tempDir });
      expect(result.matchedDomains).toHaveLength(1);
      expect(result.matchedDomains[0].id).toBe("deployment-liveness");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects output paths escaping .ai/runs/", () => {
    expect(() => ensureOutputPath(root, "docs/out.json")).toThrow("output must stay under .ai/runs/");
    expect(() => ensureOutputPath(root, "../out.json")).toThrow("output must stay under .ai/runs/");
    expect(ensureOutputPath(root, ".ai/runs/safe.json")).toContain(path.join(".ai", "runs", "safe.json"));
  });

  it("fails closed on malformed contract impact registry", () => {
    const runsDir = path.join(root, ".ai", "runs");
    fs.mkdirSync(runsDir, { recursive: true });
    const tempDir = fs.mkdtempSync(path.join(runsDir, "test-bad-reg-"));
    try {
      const aiDir = path.join(tempDir, ".ai");
      fs.mkdirSync(aiDir, { recursive: true });
      fs.writeFileSync(path.join(aiDir, "contract-impact-registry.json"), "{ bad syntax }", "utf8");
      expect(() => inspectContractImpact(["render.yaml"], { rootDir: tempDir })).toThrow(
        "[contract-impact] Malformed registry",
      );
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails closed when domain references nonexistent validator ID during selection", () => {
    const runsDir = path.join(root, ".ai", "runs");
    fs.mkdirSync(runsDir, { recursive: true });
    const tempDir = fs.mkdtempSync(path.join(runsDir, "test-bad-val-"));
    try {
      const aiDir = path.join(tempDir, ".ai");
      fs.mkdirSync(aiDir, { recursive: true });
      const badReg = {
        schemaVersion: 1,
        authorityRef: "axtask.agent-authority.v1",
        registryId: "axtask.contract-impact.v1",
        domains: [
          {
            id: "bad-domain",
            name: "Bad Domain",
            canonicalOwner: "owner",
            sourcePaths: ["render.yaml"],
            dependentSurfaces: [],
            validators: ["nonexistent-validator-id"],
            proofCeiling: "contract",
          },
        ],
      };
      fs.writeFileSync(path.join(aiDir, "contract-impact-registry.json"), JSON.stringify(badReg), "utf8");
      const valReg = JSON.parse(fs.readFileSync(path.join(root, ".ai", "validator-registry.json"), "utf8"));
      expect(() =>
        selectValidators(valReg, { changedPaths: ["render.yaml"], rootDir: tempDir }),
      ).toThrow("registry references unknown validator nonexistent-validator-id");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("does not trigger deployment impact for unrelated ordinary component files", () => {
    const result = inspectContractImpact(["client/src/components/ui/button.tsx"]);
    expect(result.matchedDomains).toHaveLength(0);
    expect(result.selectedValidators).toHaveLength(0);
  });

  it("historical documentation paths are not treated as active dependent surfaces", () => {
    const regPath = path.join(root, ".ai", "contract-impact-registry.json");
    const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
    const deploymentDomain = reg.domains.find((d) => d.id === "deployment-liveness");
    expect(deploymentDomain).toBeDefined();

    const activeDependents = deploymentDomain.dependentSurfaces ?? [];
    const historicalPaths = [
      "docs/releases/2025-01-15-old-deploy.md",
      "docs/archive/legacy-health-check.md",
    ];

    for (const hp of historicalPaths) {
      expect(activeDependents).not.toContain(hp);
    }

    const result = inspectContractImpact([historicalPaths[0]]);
    expect(result.matchedDomains).toHaveLength(0);
    expect(result.dependentSurfaces).toHaveLength(0);
  });
});
