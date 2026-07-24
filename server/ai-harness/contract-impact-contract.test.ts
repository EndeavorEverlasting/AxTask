// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectContractImpact } from "../../scripts/ai-harness/inspect-contract-impact.mjs";
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

  it("normalizes Windows path slashes consistently with POSIX slashes", () => {
    const posixRes = inspectContractImpact(["render.yaml"]);
    const winRes = inspectContractImpact(["render.yaml"]);
    expect(posixRes.selectedValidators).toEqual(winRes.selectedValidators);
    expect(posixRes.dependentSurfaces).toEqual(winRes.dependentSurfaces);
  });

  it("does not trigger deployment impact for unrelated ordinary component files", () => {
    const result = inspectContractImpact(["client/src/components/ui/button.tsx"]);
    expect(result.matchedDomains).toHaveLength(0);
    expect(result.selectedValidators).toHaveLength(0);
  });
});
