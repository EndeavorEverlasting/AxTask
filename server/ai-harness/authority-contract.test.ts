import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
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
const tempDirs: string[] = [];

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("AI harness authority contract", () => {
  it("validates the canonical repository authority manifest", () => {
    expect(validateAuthorityContract(REPO_ROOT)).toMatchObject({
      authorityId: "axtask.agent-authority.v1",
      errors: [],
    });
  });

  it("requires subordinate harness artifacts to reference canonical authority", () => {
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

  it("rejects copied authority headings and stale statements", () => {
    const headingErrors = validateHarnessArtifact(
      ".ai/skills/example.md",
      "authorityRef: axtask.agent-authority.v1\n## Authority order\n",
      CONTRACT,
    );
    expect(headingErrors.some((error: string) => error.includes("copies canonical authority heading"))).toBe(true);

    const staleErrors = validateHarnessArtifact(
      ".ai/skills/example.md",
      `authorityRef: axtask.agent-authority.v1\n${CONTRACT.forbiddenStaleStatements[0]}\n`,
      CONTRACT,
    );
    expect(staleErrors).toContain(
      ".ai/skills/example.md: contains a forbidden stale statement",
    );
  });

  it("rejects duplicate ranks", () => {
    const invalidManifest = structuredClone(MANIFEST);
    invalidManifest.orderedSources[1].rank = invalidManifest.orderedSources[0].rank;
    expect(
      validateAuthorityManifest(REPO_ROOT, invalidManifest).some((error: string) =>
        error.includes("duplicate rank"),
      ),
    ).toBe(true);
  });

  it("returns structured errors for malformed contract fields", () => {
    const invalidContract = { ...CONTRACT, authorityRefField: null };
    expect(() =>
      validateHarnessArtifact(".ai/workflows/example.yaml", "id: example\n", invalidContract),
    ).not.toThrow();
    expect(
      validateHarnessArtifact(".ai/workflows/example.yaml", "id: example\n", invalidContract),
    ).toContain(
      ".ai/workflows/example.yaml: harnessContract.authorityRefField must be a non-empty string",
    );

    const invalidManifest = structuredClone(MANIFEST);
    invalidManifest.harnessContract.manifestRoots = ".ai/skills";
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-authority-"));
    tempDirs.push(tempDir);
    fs.mkdirSync(path.join(tempDir, ".ai"), { recursive: true });
    fs.writeFileSync(
      path.join(tempDir, ".ai", "authority.json"),
      JSON.stringify(invalidManifest),
      "utf8",
    );
    expect(() => validateAuthorityContract(tempDir)).not.toThrow();
    expect(validateAuthorityContract(tempDir).errors).toContain(
      "authority.json: harnessContract.manifestRoots must be an array",
    );
  });
});
