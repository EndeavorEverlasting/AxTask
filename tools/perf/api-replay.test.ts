// @vitest-environment node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const scriptPath = path.join(repoRoot, "tools", "perf", "api-replay.mjs");
const baseline = path.join(repoRoot, "tools", "perf", "fixtures", "api-replay-baseline.json");
const regression = path.join(repoRoot, "tools", "perf", "fixtures", "api-replay-regression.json");

function runReplay(fixturePath: string): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", scriptPath, "--fixture", fixturePath],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return {
    exitCode: typeof result.status === "number" ? result.status : 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

describe("perf:api-replay", () => {
  it("passes on the healthy baseline fixture", () => {
    const { exitCode, stdout } = runReplay(baseline);
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/Replayed \d+ events/);
    // Baseline must not emit any critical-severity signal. Warnings about
    // slow routes are allowed so long as the fixture is itself healthy.
    expect(stdout).not.toMatch(/CRITICAL /);
  });

  it("exits non-zero on the regression fixture", () => {
    const { exitCode, stdout, stderr } = runReplay(regression);
    expect(exitCode).toBe(1);
    // The regression fixture pushes GET /api/tasks over both the
    // tasks_list_latency threshold AND the anyP95 critical threshold.
    expect(stdout + stderr).toMatch(/tasks_list_latency/);
    expect(stderr).toMatch(/critical signal/i);
  });

  it("no-ops (exit 0 with warning) when the fixture path is missing", () => {
    const missing = path.join(repoRoot, "tools", "perf", "fixtures", "does-not-exist.json");
    const { exitCode, stdout, stderr } = runReplay(missing);
    expect(exitCode).toBe(0);
    expect(stdout + stderr).toMatch(/Fixture not found/);
  });
});
