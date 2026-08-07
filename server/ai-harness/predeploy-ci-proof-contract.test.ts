// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
// @ts-ignore Executable ESM harness module is intentionally .mjs.
import { buildPredeployProof } from "../../scripts/ai-harness/generate-predeploy-ci-proof.mjs";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const APPROVED_CI_NODE_SHA = "6295488653f0d93b0a157841746fef7e72cc4328cfb60c4bbe0ca2668a836ffd";

describe("predeploy CI proof contract", () => {
  it("builds candidate/base-bound CLEAR + READY artifacts only from closed gates", () => {
    const result = buildPredeployProof({
      candidateSha: SHA_B,
      currentCandidateSha: SHA_B,
      baseSha: SHA_A,
      currentMainSha: SHA_A,
      repositoryClean: true,
      blockingPrCount: 0,
      ciGreen: true,
      changedPaths: [".github/workflows/test-and-attest.yml", "scripts/ai-harness/generate-predeploy-ci-proof.mjs"],
      promotionWillAutoDeploy: true,
      generatedAt: "2026-08-07T15:00:00.000Z",
      evidenceSources: { workflow: "test-and-attest" },
    });

    expect(result.security).toMatchObject({
      candidateSha: SHA_B,
      baseSha: SHA_A,
      disposition: "CLEAR",
      findings: [],
      proofCeiling: "repository-security-delta",
    });
    expect(result.readiness).toMatchObject({
      candidateSha: SHA_B,
      currentCandidateSha: SHA_B,
      baseSha: SHA_A,
      currentMainSha: SHA_A,
      promotionWillAutoDeploy: true,
      verdict: "READY_FOR_AUTHORIZED_DEPLOYMENT",
      recommendation: "AWAIT_EXPLICIT_DEPLOYMENT_AUTHORIZATION",
      missingGates: [],
    });
  });

  it("fails closed when the candidate is stale or another PR blocks release", () => {
    expect(() => buildPredeployProof({
      candidateSha: SHA_B,
      currentCandidateSha: "c".repeat(40),
      baseSha: SHA_A,
      currentMainSha: SHA_A,
      repositoryClean: true,
      blockingPrCount: 1,
      ciGreen: true,
      changedPaths: [".github/workflows/test-and-attest.yml"],
      promotionWillAutoDeploy: true,
    })).toThrow(/predeploy readiness did not close/);
  });

  it("pins the shared GitHub Actions Node binary fingerprint", () => {
    const approved = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".security", "approved-node-provenance.json"), "utf8"));
    expect(approved.entries).toContainEqual(expect.objectContaining({
      sha256: APPROVED_CI_NODE_SHA,
      platform: "linux",
      arch: "x64",
      version: "20.20.2",
      environment: "github-actions-ubuntu-24.04",
    }));
  });

  it("pins production audit + exact Node security guards before repository validation and uploads proof after certification", () => {
    const workflow = fs.readFileSync(path.join(REPO_ROOT, ".github", "workflows", "test-and-attest.yml"), "utf8");
    expect(workflow).toContain('node-version: "20.20.2"');

    const audit = workflow.indexOf("npm audit --omit=dev --audit-level=high");
    const provenance = workflow.indexOf("npm run security:node-provenance-guard");
    const runtime = workflow.indexOf("npm run security:node-runtime-guard");
    const axios = workflow.indexOf("npm run security:axios-guard");
    const typecheck = workflow.indexOf("npm run check");
    expect(audit).toBeGreaterThan(-1);
    expect(provenance).toBeGreaterThan(audit);
    expect(runtime).toBeGreaterThan(provenance);
    expect(axios).toBeGreaterThan(runtime);
    expect(typecheck).toBeGreaterThan(axios);

    const proofJob = workflow.indexOf("  predeploy-proof:");
    const localCert = workflow.indexOf("node scripts/deploy/run-local-cert.mjs --schema-ready --build-ready");
    const generator = workflow.indexOf("node scripts/ai-harness/generate-predeploy-ci-proof.mjs", proofJob);
    const upload = workflow.indexOf("actions/upload-artifact@v4", proofJob);
    expect(proofJob).toBeGreaterThan(localCert);
    expect(workflow.slice(proofJob)).toContain("needs: [test-and-attest, docker-build]");
    expect(workflow.slice(proofJob)).toContain("github.event.pull_request.head.sha");
    expect(generator).toBeGreaterThan(proofJob);
    expect(upload).toBeGreaterThan(generator);
  });
});
