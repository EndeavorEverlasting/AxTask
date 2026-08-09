import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const router = path.join(repoRoot, "scripts/ai-harness/next-stateful-task.mjs");
const validator = path.join(repoRoot, "scripts/ai-harness/validate-stateful-surface.mjs");
const tempRoots: string[] = [];

const exactFiles = [
  "server/index.ts",
  "scripts/production-start.mjs",
  "render.yaml",
  "package.json",
  "AGENT_GUARDRAILS.md",
  "drizzle.config.ts",
  "shared/schema.ts",
  "scripts/db-size-audit.mjs",
  "docs/DB_RECOVERY_RUNBOOK.md",
  "docs/SCHEDULED_RESOURCE_CONTROLS.md",
  "scripts/db-retention.mjs",
  "docs/DB_RETENTION_POLICY.md",
  ".ai/artifact-registry.json",
  "Dockerfile",
  ".ai/workflows/stateful-architecture-migration.md",
  ".ai/skills/stateful-architecture-migration.md",
  ".ai/stateful-surface-ledger.json"
];

function run(command: string, args: string[], root = repoRoot) {
  return spawnSync(process.execPath, [command, ...args, `--root=${root}`], { cwd: repoRoot, encoding: "utf8" });
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "axtask-stateful-task-loop-"));
  tempRoots.push(root);
  mkdirSync(path.join(root, ".ai", "architecture"), { recursive: true });
  cpSync(path.join(repoRoot, ".ai/stateful-execution-contract.json"), path.join(root, ".ai/stateful-execution-contract.json"));
  cpSync(path.join(repoRoot, ".ai/stateful-surface-task.schema.json"), path.join(root, ".ai/stateful-surface-task.schema.json"));
  cpSync(path.join(repoRoot, ".ai/architecture/surfaces"), path.join(root, ".ai/architecture/surfaces"), { recursive: true });
  for (const rel of exactFiles) {
    const target = path.join(root, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(repoRoot, rel), target);
  }
  return root;
}

afterEach(() => {
  while (tempRoots.length) rmSync(tempRoots.pop()!, { recursive: true, force: true });
});

describe("stateful single-fact execution loop", () => {
  it("validates every canonical surface task artifact", () => {
    const result = run(validator, ["--all", "--json"]);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.errors).toEqual([]);
    expect(parsed.surfacesChecked).toBe(8);
  });

  it("routes exactly one next unresolved fact", () => {
    const result = run(router, ["--json"]);
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.task.surfaceId).toBe("http-process-runtime");
    expect(parsed.task.gapId).toBe("process-affinity");
    expect(parsed.task.ownedPaths).toEqual(["server/index.ts", "scripts/production-start.mjs", "render.yaml"]);
    expect(Object.keys(parsed).filter((key) => key === "task")).toHaveLength(1);
  });

  it("rejects manual surface overrides that could bypass priority", () => {
    const result = run(router, ["--surface=deployment-orchestration", "--json"]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("manual surface override is forbidden");
  });

  it("advances to the next fact only after the routed gap is resolved", () => {
    const root = fixture();
    const file = path.join(root, ".ai/architecture/surfaces/http-process-runtime.json");
    const task = JSON.parse(readFileSync(file, "utf8"));
    task.evidenceGaps[0].status = "resolved";
    task.evidenceGaps[0].evidence = [{ source: "server/index.ts", finding: "The inspected entry point establishes the current process lifecycle boundary.", proofLevel: "contract" }];
    writeFileSync(file, `${JSON.stringify(task, null, 2)}\n`);

    const proof = run(validator, ["http-process-runtime", "--require=process-affinity", "--json"], root);
    expect(proof.status, `${proof.stdout}\n${proof.stderr}`).toBe(0);

    const next = run(router, ["--json"], root);
    expect(next.status, `${next.stdout}\n${next.stderr}`).toBe(0);
    const parsed = JSON.parse(next.stdout);
    expect(parsed.task.surfaceId).toBe("http-process-runtime");
    expect(parsed.task.gapId).toBe("long-lived-connections");
  });

  it("rejects claiming completion before the current fact is resolved", () => {
    const result = run(validator, ["http-process-runtime", "--require=process-affinity", "--json"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("current routed gap is not resolved");
  });

  it("rejects placeholder evidence in a resolved fact", () => {
    const root = fixture();
    const file = path.join(root, ".ai/architecture/surfaces/http-process-runtime.json");
    const task = JSON.parse(readFileSync(file, "utf8"));
    task.evidenceGaps[0].status = "resolved";
    task.evidenceGaps[0].evidence = [{ source: "server/index.ts", finding: "Unknown; figure this out later.", proofLevel: "contract" }];
    writeFileSync(file, `${JSON.stringify(task, null, 2)}\n`);
    const result = run(validator, ["http-process-runtime", "--require=process-affinity", "--json"], root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("placeholder-free");
  });

  it("rejects resolved evidence from outside the routed exact-file boundary", () => {
    const root = fixture();
    const file = path.join(root, ".ai/architecture/surfaces/http-process-runtime.json");
    const task = JSON.parse(readFileSync(file, "utf8"));
    task.evidenceGaps[0].status = "resolved";
    task.evidenceGaps[0].evidence = [{ source: "package.json", finding: "This source exists but is outside the current gap boundary.", proofLevel: "contract" }];
    writeFileSync(file, `${JSON.stringify(task, null, 2)}\n`);
    const result = run(validator, ["http-process-runtime", "--require=process-affinity", "--json"], root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("must be one of the current gap exactFiles");
  });

  it("enforces the declared task schema instead of treating it as documentation", () => {
    const root = fixture();
    const file = path.join(root, ".ai/architecture/surfaces/http-process-runtime.json");
    const task = JSON.parse(readFileSync(file, "utf8"));
    task.unregisteredField = true;
    writeFileSync(file, `${JSON.stringify(task, null, 2)}\n`);
    const result = run(validator, ["http-process-runtime", "--json"], root);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain("unexpected property unregisteredField");
  });

  it("caps nonproductive operations and codifies CRLF repair", () => {
    const contract = JSON.parse(readFileSync(path.join(repoRoot, ".ai/stateful-execution-contract.json"), "utf8"));
    expect(contract.selectionPolicy.maxTasksReturned).toBe(1);
    expect(contract.actionBudget.maxNonProductiveOperationsAfterRouting).toBe(3);
    expect(contract.lineEndingNoisePolicy.command).toContain("restore-eol-noise.mjs");
    expect(contract.globalForbidden.join(" ")).toContain("Do not rewrite the complete ledger");
  });
});
