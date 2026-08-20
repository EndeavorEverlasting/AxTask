import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertRepositoryPath } from "../../scripts/ai-harness/show-context.mjs";
import { loadTokenizerContract } from "../../scripts/ai-harness/tokenizer.mjs";
import {
  validateBudgetException,
  validateProgressiveDisclosure,
} from "../../scripts/ai-harness/validate-progressive-disclosure.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function withinBudget(measurement: { estimatedTokens: number; limit: number; exceptionApproved?: boolean }) {
  return measurement.estimatedTokens <= measurement.limit || measurement.exceptionApproved === true;
}

describe("progressive disclosure harness contract", () => {
  const result = validateProgressiveDisclosure(ROOT);

  it("keeps routing complete and fail-closed", () => {
    expect(result.errors).toEqual([]);
  });

  it("uses Hugging Face as the canonical general backend and OpenAI tiktoken for exact context counting", () => {
    const { registry, profile, backend } = loadTokenizerContract(ROOT);
    expect(registry.canonicalGeneralBackendId).toBe("huggingface-tokenizers");
    expect(registry.backends.find((item: { id?: string }) => item.id === "huggingface-tokenizers")).toMatchObject({
      repository: "huggingface/tokenizers",
      status: "canonical-general",
    });
    expect(backend).toMatchObject({ repository: "openai/tiktoken", status: "active-context-counting" });
    expect(profile).toMatchObject({ encoding: "o200k_base", measurement: "exact-tokenization" });
    for (const measurement of Object.values(result.measurements)) {
      expect(measurement).toMatchObject({
        measurement: "exact-tokenization",
        backend: "openai/tiktoken",
        encoding: "o200k_base",
      });
      expect(Number.isInteger(measurement.tokens)).toBe(true);
      expect(measurement.estimatedTokens).toBe(measurement.tokens);
    }
  });

  it("keeps the 50k orientation under the soft ceiling or an approved structured exception", () => {
    expect(withinBudget(result.measurements.orientation)).toBe(true);
  });

  it("keeps every 30k domain isolated and within its additional budget contract", () => {
    const domains = Object.entries(result.measurements).filter(([key]) => key.startsWith("domain:"));
    expect(domains.length).toBeGreaterThan(0);
    for (const [, measurement] of domains) expect(withinBudget(measurement)).toBe(true);
  });

  it("routes every 15k workflow bundle within its additional budget contract", () => {
    const workflows = Object.entries(result.measurements).filter(([key]) => key.startsWith("workflow:"));
    expect(workflows.length).toBeGreaterThan(0);
    for (const [, measurement] of workflows) expect(withinBudget(measurement)).toBe(true);
  });

  it("requires structured, scoped, authority-approved, unexpired budget exceptions", () => {
    const label = "workflow:axtask.example.v1";
    const valid = validateBudgetException({
      kind: "axtask.context-budget-exception.v1",
      bundle: label,
      owner: "repository-harness",
      reason: "The authoritative contract cannot be split further without hiding a required safety dependency.",
      approvalRef: "axtask.agent-authority.v1",
      expiresOn: "2999-12-31",
    }, label, new Date("2026-08-19T00:00:00Z"));
    expect(valid).toEqual({ approved: true, errors: [] });

    const invalid = validateBudgetException({
      kind: "axtask.context-budget-exception.v1",
      bundle: "workflow:wrong.v1",
      owner: "repository-harness",
      reason: "too short",
      approvalRef: "not-authority",
      expiresOn: "2026-08-18",
    }, label, new Date("2026-08-19T00:00:00Z"));
    expect(invalid.approved).toBe(false);
    expect(invalid.errors.length).toBeGreaterThanOrEqual(4);
  });

  it("rejects routed symlinks that resolve outside the repository", () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-disclosure-boundary-"));
    const outside = path.join(scratch, "outside.md");
    const relativeLink = `.ai/runs/disclosure-boundary-${process.pid}.md`;
    const link = path.join(ROOT, relativeLink);
    fs.mkdirSync(path.dirname(link), { recursive: true });
    fs.writeFileSync(outside, "outside\n", "utf8");
    try {
      try {
        fs.symlinkSync(outside, link, "file");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EPERM" || (error as NodeJS.ErrnoException).code === "EACCES") return;
        throw error;
      }
      expect(() => assertRepositoryPath(ROOT, relativeLink)).toThrow("resolves outside repository root");
    } finally {
      fs.rmSync(link, { force: true });
      fs.rmSync(scratch, { recursive: true, force: true });
    }
  });
});
