import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const validatorPath = path.join(repoRoot, "scripts", "ai-harness", "validate-work-queue.mjs");

function runValidator(file?: string) {
  const args = [validatorPath];
  if (file) args.push("--file", file);
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function minimalTask(overrides: Record<string, string> = {}, heading = "## AXQ-900 — Test task") {
  const values = {
    Status: "READY",
    Priority: "P1",
    Owner: "unclaimed",
    "Branch / PR": "none",
    Scope: "bounded test scope",
    Forbidden: "production mutation",
    Dependencies: "none",
    References: "AGENTS.md",
    "Acceptance gate": "observable proof exists",
    Gate: "none",
    "Last proof": "none",
    "Next action": "create the bounded artifact and validate it",
    Updated: "2026-08-09",
    ...overrides,
  };

  return `authorityRef: axtask.agent-authority.v1

# Test queue

Continuation states are not stopping states.
PR opened is not completion.
DONE is strict.
Canonical terminal action: none; no safe actionable work remains

${heading}

${Object.entries(values)
  .map(([key, value]) => `- **${key}:** ${value}`)
  .join("\n")}
`;
}

function writeTempQueue(content: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "axtask-work-queue-"));
  const file = path.join(dir, "queue.md");
  fs.writeFileSync(file, content);
  return file;
}

describe("[ai-harness] shared work queue contract", () => {
  it("validates the repository queue", () => {
    const result = runValidator();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("[work-queue] PASS");
  });

  it("rejects blank required field values", () => {
    const result = runValidator(writeTempQueue(minimalTask({ Scope: "" })));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("required field 'Scope' must not be blank");
  });

  it("rejects plausible AXQ headings that do not use the canonical form", () => {
    const result = runValidator(
      writeTempQueue(minimalTask({}, "## AXQ-900 - Test task")),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("malformed AXQ heading");
  });

  it("rejects a DONE task without durable proof or the terminal next-action marker", () => {
    const result = runValidator(
      writeTempQueue(
        minimalTask({
          Status: "DONE",
          Gate: "none",
          "Last proof": "none",
          "Next action": "merge later",
        }),
      ),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DONE requires durable Last proof");
    expect(result.stderr).toContain("DONE requires the canonical no-work-remains Next action");
  });

  it("rejects arbitrary prose as DONE proof", () => {
    const result = runValidator(
      writeTempQueue(
        minimalTask({
          Status: "DONE",
          Gate: "none",
          "Last proof": "completed successfully",
          "Next action": "none; no safe actionable work remains",
        }),
      ),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DONE Last proof must include a durable evidence token");
  });

  it("accepts a DONE task with a recognized durable evidence token", () => {
    const result = runValidator(
      writeTempQueue(
        minimalTask({
          Status: "DONE",
          Owner: "agent-session-123",
          Gate: "none",
          "Last proof": "merge:511522e1ba8c5eb45cf90c87fb30defd2973586e; workflow:31323886919 passed",
          "Next action": "none; no safe actionable work remains",
        }),
      ),
    );

    expect(result.status, result.stderr).toBe(0);
  });

  it("rejects a MERGE continuation state that tries to stop", () => {
    const result = runValidator(
      writeTempQueue(
        minimalTask({
          Status: "MERGE",
          Owner: "agent-session-123",
          "Next action": "none; no safe actionable work remains",
        }),
      ),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("MERGE is a continuation state");
  });

  it("requires concrete gates for BLOCKED and OPERATOR items", () => {
    const result = runValidator(
      writeTempQueue(
        minimalTask({
          Status: "OPERATOR",
          Owner: "operator",
          Gate: "none",
        }),
      ),
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("OPERATOR requires an exact Gate");
  });
});
