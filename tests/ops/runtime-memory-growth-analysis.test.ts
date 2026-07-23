import { describe, expect, it } from "vitest";
import {
  analyzeMemoryRecords,
  parseMemoryRecordLine,
  parseMemoryRecords,
  renderEnglishReport,
} from "../../scripts/analyze-runtime-memory-growth.mjs";

type DeltaInput = {
  rssMiB?: number;
  heapUsedMiB?: number;
  externalMiB?: number;
  arrayBuffersMiB?: number;
};

function record(
  label: string,
  delta: DeltaInput,
  metrics: Record<string, number> = {},
  pressureSignals: string[] = [],
) {
  return {
    event: "axtask.runtime.memory",
    label,
    phase: "operation",
    outcome: "ok",
    durationMs: 20,
    pid: 123,
    uptimeSeconds: 60,
    before: {
      rssMiB: 100,
      heapUsedMiB: 40,
      heapTotalMiB: 60,
      heapLimitMiB: 512,
      heapUsedPercentOfLimit: 8,
      externalMiB: 3,
      arrayBuffersMiB: 1,
    },
    after: {
      rssMiB: 100 + (delta.rssMiB ?? 0),
      heapUsedMiB: 40 + (delta.heapUsedMiB ?? 0),
      heapTotalMiB: 60,
      heapLimitMiB: 512,
      heapUsedPercentOfLimit: 9,
      externalMiB: 3 + (delta.externalMiB ?? 0),
      arrayBuffersMiB: 1 + (delta.arrayBuffersMiB ?? 0),
    },
    delta: {
      rssMiB: delta.rssMiB ?? 0,
      heapUsedMiB: delta.heapUsedMiB ?? 0,
      heapTotalMiB: 0,
      heapLimitMiB: 0,
      heapUsedPercentOfLimit: 1,
      externalMiB: delta.externalMiB ?? 0,
      arrayBuffersMiB: delta.arrayBuffersMiB ?? 0,
    },
    pressureSignals,
    metrics,
  };
}

describe("runtime memory growth analyzer", () => {
  it("extracts a structured memory record from a Render-prefixed line", () => {
    const payload = record("reminders.dispatch", { heapUsedMiB: 2 }, { scanned: 4 });
    const parsed = parseMemoryRecordLine(
      `2026-07-15T18:00:00Z ${JSON.stringify(payload)}`,
    );
    expect(parsed).toMatchObject({
      event: "axtask.runtime.memory",
      label: "reminders.dispatch",
      phase: "operation",
    });
  });

  it("ignores unrelated and malformed log lines", () => {
    const parsed = parseMemoryRecords(
      [
        "ordinary request log",
        '{"event":"axtask.runtime.memory",bad-json}',
        JSON.stringify({ event: "other.event" }),
      ].join("\n"),
    );
    expect(parsed.records).toEqual([]);
    expect(parsed.ignoredLines).toBe(3);
  });

  it("ranks repeated heap growth with metric correlation as strong evidence", () => {
    const records = [1.5, 2, 2.5, 3, 3.5, 4].map((heapUsedMiB, index) =>
      record(
        "reminders.dispatch",
        { heapUsedMiB, rssMiB: heapUsedMiB + 0.5 },
        { scanned: (index + 1) * 10, attempted: index + 1 },
        ["heap-growth"],
      ),
    );

    const analysis = analyzeMemoryRecords(records);
    expect(analysis.labelCounts.strong).toBe(1);
    expect(analysis.labels[0]).toMatchObject({
      label: "reminders.dispatch",
      strongestDomain: "heapUsedMiB",
      strength: "strong",
      maxHeapUsedPercentOfLimit: 9,
    });
    expect(analysis.labels[0].domainEvidence[0].correlations[0]).toMatchObject({
      metric: "scanned",
      correlation: 1,
      samples: 6,
    });
  });

  it("does not promote mixed transient deltas into a leak candidate", () => {
    const records = [-1, 1, -1, 1, 0, 0].map((heapUsedMiB) =>
      record("mixed.operation", { heapUsedMiB, rssMiB: heapUsedMiB }),
    );
    const analysis = analyzeMemoryRecords(records);
    expect(analysis.labels[0].strength).toBe("none");
  });

  it("distinguishes repeated array-buffer growth from JavaScript heap growth", () => {
    const records = Array.from({ length: 5 }, (_, index) =>
      record(
        "export.buffer",
        { arrayBuffersMiB: 2 + index * 0.25, rssMiB: 2 + index * 0.25 },
        { rows: (index + 1) * 100 },
        ["array-buffer-growth"],
      ),
    );
    const analysis = analyzeMemoryRecords(records);
    expect(analysis.labels[0]).toMatchObject({
      label: "export.buffer",
      strongestDomain: "arrayBuffersMiB",
      strength: "strong",
    });
  });

  it("falls back to the default sample floor for invalid input", () => {
    const analysis = analyzeMemoryRecords([], { minSamples: Number.NaN });
    expect(analysis.minSamples).toBe(3);
  });

  it("states the proof ceiling in the English report", () => {
    const analysis = analyzeMemoryRecords([
      record("single.operation", { heapUsedMiB: 1 }),
    ]);
    const report = renderEnglishReport(analysis, { ignoredLines: 2 });
    expect(report).toContain("AXTASK RUNTIME MEMORY GROWTH ANALYSIS");
    expect(report).toContain("Proof ceiling:");
    expect(report).toContain("Object-level proof");
  });
});
