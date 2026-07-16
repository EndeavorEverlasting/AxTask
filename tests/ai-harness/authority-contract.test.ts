import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  validateAuthorityContract,
  validateAuthorityManifest,
  validateHarnessArtifact,
} from "../../scripts/ai-harness/validate-authority.mjs";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..", "..");
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, ".ai", "authority.json"), "utf8"),
);
const CONTRACT = MANIFEST.harnessContract;

describe("AI harness authority contract", () => {
  it("validates the canonical repository authority manifest", () => {
    const result = validateAuthorityContract(REPO_ROOT);
    expect(result).toMatchObject({
      authorityId: "axtask.agent-authority.v1",
      errors: [],
    });
  });

  it("requires future harness artifacts to reference canonical authority", () => {
    expect(
      validateHarnessArtifact(
        ".ai/workflows/example.yaml",
        "id: example\nsteps: []\n",
        CONTRACT,
      ),
    ).toContain(
      ".ai/workflows/example.yaml: expected authorityRef=axtask.agent-authority.v1",
    );

    expect(
      validateHarnessArtifact(
        ".ai/workflows/example.yaml",
        "authorityRef: axtask.agent-authority.v1\nid: example\nsteps: []\n",
        CONTRACT,
      ),
    ).toEqual([]);
  });

  it("rejects copied authority headings in subordinate artifacts", () => {
    const errors = validateHarnessArtifact(
      ".ai/skills/example.md",
      [
        "authorityRef: axtask.agent-authority.v1",
        "## Authority order",
        "This duplicate policy should not live here.",
      ].join("\n"),
      CONTRACT,
    );
    expect(errors.some((error: string) => error.includes("copies canonical authority heading"))).toBe(true);
  });

  it("rejects known stale statements without duplicating them in the test", () => {
    const staleStatement = CONTRACT.forbiddenStaleStatements[0];
    const errors = validateHarnessArtifact(
      ".ai/capabilities/example.md",
      `authorityRef: axtask.agent-authority.v1\n${staleStatement}\n`,
      CONTRACT,
    );
    expect(errors).toContain(
      ".ai/capabilities/example.md: contains a forbidden stale statement",
    );
  });

  it("rejects duplicate ranks in the authority manifest", () => {
    const invalidManifest = structuredClone(MANIFEST);
    invalidManifest.orderedSources[1].rank = invalidManifest.orderedSources[0].rank;
    const errors = validateAuthorityManifest(REPO_ROOT, invalidManifest);
    expect(errors.some((error: string) => error.includes("duplicate rank"))).toBe(true);
  });

  it("rejects malformed JSON harness artifacts", () => {
    const errors = validateHarnessArtifact(
      ".ai/triggers/example.json",
      '{"authorityRef":',
      CONTRACT,
    );
    expect(errors.some((error: string) => error.includes("invalid JSON"))).toBe(true);
  });
});
