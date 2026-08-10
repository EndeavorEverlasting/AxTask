import { describe, expect, it } from "vitest";
import { workingDiffCheckArgs } from "../../scripts/ai-harness/validate-working-diff.mjs";

describe("working diff hygiene routing", () => {
  it("checks only semantic tracked paths and excludes proven EOL-only paths", () => {
    const args = workingDiffCheckArgs({
      semanticTracked: ["src/changed.ts", "docs/real-change.md"],
      lineEndingOnly: ["docs/CHANGELOG.md", "docs/VERSION_1.3.0_PLAN.md"],
    });

    expect(args).toEqual([
      "diff",
      "--check",
      "--ignore-cr-at-eol",
      "--",
      "src/changed.ts",
      "docs/real-change.md",
    ]);
    expect(args).not.toContain("docs/CHANGELOG.md");
    expect(args).not.toContain("docs/VERSION_1.3.0_PLAN.md");
  });

  it("skips the unstaged whitespace invocation when every tracked difference is proven EOL-only", () => {
    expect(workingDiffCheckArgs({
      semanticTracked: [],
      lineEndingOnly: ["docs/CHANGELOG.md", "docs/VERSION_1.3.0_PLAN.md"],
    })).toBeNull();
  });

  it("deduplicates semantic paths before invoking git", () => {
    expect(workingDiffCheckArgs({ semanticTracked: ["src/a.ts", "src/a.ts"] })).toEqual([
      "diff",
      "--check",
      "--ignore-cr-at-eol",
      "--",
      "src/a.ts",
    ]);
  });
});
