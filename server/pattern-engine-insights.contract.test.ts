// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");

describe("pattern engine insights carry taskIds", () => {
  const source = fs.readFileSync(
    path.join(root, "server", "engines", "pattern-engine.ts"),
    "utf8",
  );

  it("PatternInsight shape exposes an optional taskIds array", () => {
    expect(source).toMatch(/taskIds\?:\s*string\[\]/);
  });

  it("similarity_cluster populates taskIds from its underlying tasks", () => {
    /* Look inside buildSimilarityClusters for cluster.tasks.*map((t) => t.id). */
    expect(source).toMatch(/cluster\.tasks\.slice\(0,\s*5\)\.map\(\(t\)\s*=>\s*t\.id\)/);
  });

  it("recurrence populates taskIds from the sorted occurrence list", () => {
    expect(source).toMatch(/sorted\.slice\(-5\)\.reverse\(\)\.map\(\(t\)\s*=>\s*t\.id\)/);
  });

  it("topic populates taskIds from the per-phrase task-id buffer", () => {
    /* The extractTopics helper maintains taskIds per phrase bucket. */
    expect(source).toMatch(/entry\.taskIds\.push\(task\.id\)/);
  });

  it("deadline_rhythm intentionally omits taskIds (aggregate-only)", () => {
    const rhythmSection = source.slice(
      source.indexOf("rhythmData: DeadlineRhythmData"),
      source.indexOf("detectDeadlineRhythms", source.indexOf("detectDeadlineRhythms") + 1),
    );
    expect(rhythmSection).not.toMatch(/taskIds:/);
  });

  it("getInsights threads taskIds through when present", () => {
    /* Each clickable insight type spreads taskIds onto the outbound shape. */
    const spread = (source.match(/taskIds:\s*data\.taskIds\.slice\(0,\s*5\)/g) || []).length;
    expect(spread).toBeGreaterThanOrEqual(2);
    expect(source).toMatch(/taskIds:\s*taskIdList/);
  });
});
