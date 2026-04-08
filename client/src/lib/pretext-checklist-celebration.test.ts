import { describe, expect, it } from "vitest";
import {
  CHECKLIST_COMPLETION_QUIPS,
  buildCelebrationNarration,
  hashStringToUint32,
  pickCelebrationQuip,
} from "./pretext-checklist-celebration";

describe("pretext-checklist-celebration", () => {
  it("hashStringToUint32 is stable for the same input", () => {
    expect(hashStringToUint32("task-abc")).toBe(hashStringToUint32("task-abc"));
  });

  it("hashStringToUint32 differs for different inputs", () => {
    expect(hashStringToUint32("a")).not.toBe(hashStringToUint32("b"));
  });

  it("pickCelebrationQuip returns a quip from the pool", () => {
    const q = pickCelebrationQuip("id-1", CHECKLIST_COMPLETION_QUIPS);
    expect(CHECKLIST_COMPLETION_QUIPS).toContain(q);
  });

  it("pickCelebrationQuip is deterministic per task id", () => {
    expect(pickCelebrationQuip("same", CHECKLIST_COMPLETION_QUIPS)).toBe(
      pickCelebrationQuip("same", CHECKLIST_COMPLETION_QUIPS),
    );
  });

  it("pickCelebrationQuip stays within index range", () => {
    const quips = ["a", "b", "c"] as const;
    for (let i = 0; i < 50; i++) {
      const q = pickCelebrationQuip(`t${i}`, quips);
      expect(quips).toContain(q);
    }
  });

  it("buildCelebrationNarration includes activity and quip", () => {
    const n = buildCelebrationNarration("Buy milk", CHECKLIST_COMPLETION_QUIPS[0]);
    expect(n).toContain("Buy milk");
    expect(n).toContain("done");
    expect(n).toContain(CHECKLIST_COMPLETION_QUIPS[0]);
  });

  it("buildCelebrationNarration uses fallback label when empty", () => {
    const n = buildCelebrationNarration("   ", "Nice.");
    expect(n).toContain("That item");
    expect(n).toContain("Nice.");
  });
});
