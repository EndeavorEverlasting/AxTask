import { describe, expect, it } from "vitest";
import { classifyScan } from "./pr-factor/classifier.mjs";
import { planSlices } from "./pr-factor/planner.mjs";
import { buildTestAdvice } from "./pr-factor/advisor.mjs";

const config = {
  bucketRules: [
    { bucket: "tests", prefixes: [], globSuffixes: [".test.ts"] },
    { bucket: "schema", prefixes: ["shared/", "migrations/"], globSuffixes: [] },
    { bucket: "api", prefixes: ["server/"], globSuffixes: [] },
    { bucket: "ui", prefixes: ["client/"], globSuffixes: [] },
    { bucket: "docs", prefixes: ["docs/"], globSuffixes: [".md"] },
    { bucket: "infra", prefixes: [".github/", "tools/"], globSuffixes: [".yml"] },
  ],
  priorityOrder: ["schema", "api", "ui", "infra", "docs", "tests", "unknown"],
};

describe("pr-factor classifier/planner", () => {
  it("classifies files by configured rules", () => {
    const scanData = {
      baseRef: "origin/main",
      changedFileCount: 4,
      files: [
        { file: "shared/schema.ts", added: 10, deleted: 1 },
        { file: "server/routes.ts", added: 10, deleted: 1 },
        { file: "client/src/pages/mini-games.tsx", added: 10, deleted: 1 },
        { file: "docs/PR_SEGMENTATION.md", added: 10, deleted: 1 },
      ],
    };
    const classified = classifyScan(scanData as any, config as any);
    expect(classified.byBucket.schema).toBe(1);
    expect(classified.byBucket.api).toBe(1);
    expect(classified.byBucket.ui).toBe(1);
    expect(classified.byBucket.docs).toBe(1);
  });

  it("plans deterministic slices in configured order", () => {
    const classified = {
      files: [
        { file: "server/routes.ts", bucket: "api" },
        { file: "shared/schema.ts", bucket: "schema" },
        { file: "client/src/App.tsx", bucket: "ui" },
      ],
    };
    const plan = planSlices(classified as any, { maxFiles: 200 }, config as any);
    expect(plan.slices.map((s) => s.buckets[0])).toEqual(["schema", "api", "ui"]);
  });

  it("builds test advice per slice", () => {
    const advice = buildTestAdvice([
      { id: "part-1", title: "schema", buckets: ["schema"] },
      { id: "part-2", title: "ui", buckets: ["ui"] },
    ] as any);
    expect(advice[0].checks).toContain("npm run check");
    expect(advice[0].checks).toContain("npm test -- shared/study-schema.test.ts");
    expect(advice[1].checks).toContain("npm test -- client/src/lib/study-api.test.ts");
  });
});
