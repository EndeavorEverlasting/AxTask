import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const validator = path.join(repoRoot, "scripts/ai-harness/validate-stateful-architecture.mjs");
const tempRoots: string[] = [];

function run(root = repoRoot) {
  return spawnSync(process.execPath, [validator, `--root=${root}`, "--json"], { cwd: repoRoot, encoding: "utf8" });
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "axtask-stateful-architecture-"));
  tempRoots.push(root);
  cpSync(path.join(repoRoot, ".ai"), path.join(root, ".ai"), { recursive: true });
  cpSync(path.join(repoRoot, "docs", "architecture"), path.join(root, "docs", "architecture"), { recursive: true });
  return root;
}

afterEach(() => {
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe("stateful architecture harness", () => {
  it("validates the canonical ledger and registrations", () => {
    const result = run();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.errors).toEqual([]);
    expect(parsed.surfacesChecked).toBeGreaterThanOrEqual(6);
    const ledger = JSON.parse(readFileSync(path.join(repoRoot, ".ai/stateful-surface-ledger.json"), "utf8"));
    for (const surface of ledger.surfaces) if (surface.decisionStatus === "provisional") expect(surface.disposition).toBe("keep");
  });

  it("rejects a provisional migration decision", () => {
    const root = fixture();
    const ledgerPath = path.join(root, ".ai/stateful-surface-ledger.json");
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    ledger.surfaces[0].disposition = "delete";
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("provisional decisions must fail closed to keep");
  });

  it("rejects schema-invalid surface values", () => {
    const root = fixture();
    const ledgerPath = path.join(root, ".ai/stateful-surface-ledger.json");
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    ledger.surfaces[0].category = "nonsense";
    ledger.surfaces[0].files = [null];
    ledger.surfaces[0].proofCeiling = "wishful-thinking";
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("category: value is not in declared enum");
    expect(result.stdout).toContain("files[0]: expected string");
    expect(result.stdout).toContain("proofCeiling: value is not in declared enum");
  });

  it("rejects more than one active approved migration seam", () => {
    const root = fixture();
    const ledgerPath = path.join(root, ".ai/stateful-surface-ledger.json");
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    for (const index of [0, 1]) {
      ledger.surfaces[index].decisionStatus = "approved";
      ledger.surfaces[index].disposition = "externalize";
    }
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("at most one approved non-keep seam is allowed");
  });

  it("allows one completed historical migration beside one active approved seam", () => {
    const root = fixture();
    const ledgerPath = path.join(root, ".ai/stateful-surface-ledger.json");
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    ledger.surfaces[0].decisionStatus = "completed";
    ledger.surfaces[0].disposition = "externalize";
    ledger.surfaces[1].decisionStatus = "approved";
    ledger.surfaces[1].disposition = "replace";
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    const result = run(root);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  });

  it("rejects a migration authorization rule without a token-safe one-seam clause", () => {
    const root = fixture();
    const ledgerPath = path.join(root, ".ai/stateful-surface-ledger.json");
    const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
    ledger.decisionPolicy.migrationAuthorizationRule = "Someone may change a provisional surface while preserving KEEP.";
    writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("must require one named migrationSeam");
  });

  it("rejects missing deterministic serverless routing", () => {
    const root = fixture();
    const triggerPath = path.join(root, ".ai/trigger-registry.json");
    const triggers = JSON.parse(readFileSync(triggerPath, "utf8"));
    triggers.triggers = triggers.triggers.filter((item: { id?: string }) => item.id !== "serverless-or-stateful-architecture-change");
    writeFileSync(triggerPath, `${JSON.stringify(triggers, null, 2)}\n`);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("must route serverless-or-stateful-architecture-change");
  });

  it("rejects prompt-only architecture guidance that loses code/domain boundary", () => {
    const root = fixture();
    const workflowPath = path.join(root, ".ai/workflows/stateful-architecture-migration.md");
    const text = readFileSync(workflowPath, "utf8").replace("Application logic remains in code and domain contracts, not hidden in prompts.", "Prompts may define application behavior.");
    writeFileSync(workflowPath, text);
    const result = run(root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("application logic remains in code and domain contracts");
  });
});
