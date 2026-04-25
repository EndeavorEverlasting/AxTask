// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Task } from "@shared/schema";
import { deriveTaskRange } from "./task-gantt";

/**
 * Gantt time-window derivation.
 *
 * Free-tier tasks won't have the new startDate/endDate/durationMinutes fields,
 * so the Gantt must fall back to `date` (+ optional `time`) and the `effort`
 * heuristic. These tests lock that contract in so the freemium baseline keeps
 * producing visible bars without paid customization.
 */

function baseTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    userId: "u-1",
    date: "2026-04-20",
    time: null,
    activity: "Draft proposal",
    notes: "",
    urgency: null,
    impact: null,
    effort: null,
    prerequisites: "",
    recurrence: "none",
    priority: "Medium",
    priorityScore: 0,
    classification: "General",
    classificationAssociations: null,
    status: "pending",
    isRepeated: false,
    sortOrder: 0,
    visibility: "private",
    communityShowNotes: false,
    startDate: null,
    endDate: null,
    durationMinutes: null,
    dependsOn: null,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as Task;
}

describe("deriveTaskRange — free-tier fallback", () => {
  it("uses the task date at 09:00 when only `date` is set", () => {
    const r = deriveTaskRange(baseTask());
    expect(r).not.toBeNull();
    expect(r!.start.toISOString()).toBe(new Date("2026-04-20T09:00:00").toISOString());
    // default duration is 60 minutes when no effort is known
    expect(r!.end.getTime() - r!.start.getTime()).toBe(60 * 60_000);
  });

  it("honors explicit `time` when present", () => {
    const r = deriveTaskRange(baseTask({ time: "14:30" }));
    expect(r!.start.toISOString()).toBe(new Date("2026-04-20T14:30:00").toISOString());
  });

  it("translates effort 1..5 to 15/30/60/120/240 minute bars (floored at 20m for visibility)", () => {
    // Effort 1 maps to 15 minutes but is floored to 20 minutes so the bar is visible on a
    // multi-week Gantt window. This is a visual contract, not the logical mapping.
    const expectations: Record<number, number> = { 1: 20, 2: 30, 3: 60, 4: 120, 5: 240 };
    for (const [effort, minutes] of Object.entries(expectations)) {
      const r = deriveTaskRange(baseTask({ effort: Number(effort) }));
      expect(r!.end.getTime() - r!.start.getTime()).toBe(minutes * 60_000);
    }
  });

  it("returns null for tasks whose `date` cannot be parsed", () => {
    const r = deriveTaskRange(baseTask({ date: "not-a-date" }));
    expect(r).toBeNull();
  });
});

describe("deriveTaskRange — premium Gantt fields", () => {
  it("prefers startDate over date+time", () => {
    const r = deriveTaskRange(baseTask({ startDate: "2026-05-01T10:00", time: "09:00" }));
    expect(r!.start.toISOString()).toBe(new Date("2026-05-01T10:00:00").toISOString());
  });

  it("uses explicit endDate when provided", () => {
    const r = deriveTaskRange(
      baseTask({ startDate: "2026-05-01T10:00", endDate: "2026-05-01T12:00" }),
    );
    expect(r!.end.toISOString()).toBe(new Date("2026-05-01T12:00:00").toISOString());
  });

  it("uses durationMinutes when endDate is missing", () => {
    const r = deriveTaskRange(baseTask({ startDate: "2026-05-01T10:00", durationMinutes: 45 }));
    expect(r!.end.getTime() - r!.start.getTime()).toBe(45 * 60_000);
  });

  it("pins a minimum visible width for zero-length or inverted ranges", () => {
    const r = deriveTaskRange(
      baseTask({ startDate: "2026-05-01T10:00", endDate: "2026-05-01T10:00" }),
    );
    const minutes = (r!.end.getTime() - r!.start.getTime()) / 60_000;
    expect(minutes).toBeGreaterThanOrEqual(20);
  });

  it("falls back to date when startDate is malformed", () => {
    const r = deriveTaskRange(baseTask({ startDate: "garbage" }));
    expect(r).not.toBeNull();
    expect(r!.start.toISOString()).toBe(new Date("2026-04-20T09:00:00").toISOString());
  });
});

describe("TaskGantt SVG layout contract", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "task-gantt.tsx"), "utf8");

  it("uses uniform scale so axis text is not non-uniformly stretched", () => {
    expect(src).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(src).not.toMatch(/<svg[\s\S]*preserveAspectRatio="none"/);
    expect(src).toContain("aspectRatio: `100 / ${svgHeight}`");
  });
});
