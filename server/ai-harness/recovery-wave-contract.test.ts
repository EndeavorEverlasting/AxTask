import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("post-R1 recovery wave contract", () => {
  it("keeps safe recovery work parallel and source-read-only", () => {
    const run = spawnSync(process.execPath, ["scripts/ai-harness/validate-recovery-wave.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain("[recovery-wave] PASS");
  });
});
