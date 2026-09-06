// @vitest-environment node
import { describe, expect, it } from "vitest";
import { computeTaskFingerprint, normalizeForFingerprint } from "./task-fingerprint";

describe("normalizeForFingerprint", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeForFingerprint("  Hello   World  ")).toBe("hello world");
    expect(normalizeForFingerprint("UPPER")).toBe("upper");
    expect(normalizeForFingerprint("tab\there")).toBe("tab here");
  });

  it("treats null and undefined as empty string", () => {
    expect(normalizeForFingerprint(null)).toBe("");
    expect(normalizeForFingerprint(undefined)).toBe("");
  });
});

describe("computeTaskFingerprint", () => {
  it("returns a sha256 hex string", () => {
    const fp = computeTaskFingerprint({
      date: "2025-01-01",
      time: "09:00",
      activity: "Morning run",
      notes: "5km route",
    });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it("preserves the persisted legacy fingerprint representation", () => {
    const fp = computeTaskFingerprint({
      date: "2025-01-01",
      time: "09:00",
      activity: "Morning run",
      notes: "5km route",
    });
    expect(fp).toBe("86e61a2bfd8104422ee4d440426d879e34d9fd656bb9bfd2658c67a4aa7432df");
  });

  it("is deterministic for identical inputs", () => {
    const task = { date: "2025-01-01", activity: "A", notes: "" };
    const a = computeTaskFingerprint(task);
    const b = computeTaskFingerprint(task);
    expect(a).toBe(b);
  });

  it("produces different hashes for differing inputs", () => {
    const base = { date: "2025-01-01", activity: "A", notes: "" };
    const changed = { date: "2025-01-02", activity: "A", notes: "" };
    expect(computeTaskFingerprint(base)).not.toBe(computeTaskFingerprint(changed));
  });

  it("treats time and notes as fingerprint dimensions", () => {
    const base = { date: "2025-01-01", time: "09:00", activity: "A", notes: "x" };
    const noTime = { date: "2025-01-01", time: null, activity: "A", notes: "x" };
    const noNotes = { date: "2025-01-01", time: "09:00", activity: "A", notes: null };
    expect(computeTaskFingerprint(base)).not.toBe(computeTaskFingerprint(noTime));
    expect(computeTaskFingerprint(base)).not.toBe(computeTaskFingerprint(noNotes));
  });

  it("is insensitive to leading/trailing whitespace and case", () => {
    const a = computeTaskFingerprint({ date: "2025-01-01", activity: "  Run  ", notes: "FAST" });
    const b = computeTaskFingerprint({ date: "2025-01-01  ", activity: "run", notes: "fast" });
    expect(a).toBe(b);
  });

  it("no collisions among 2,000 distinct single-task fingerprints", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2_000; i++) {
      const date = `2025-${String(Math.floor(Math.random() * 12) + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 28) + 1).padStart(2, "0")}`;
      const time = ["", "08:00", "14:30", "23:59"][Math.floor(Math.random() * 4)];
      const activity = `Activity ${Math.random().toString(36).slice(2, 10)}`;
      const notes = Math.random() > 0.5 ? `Note ${Math.random().toString(36).slice(2, 10)}` : "";
      const fp = computeTaskFingerprint({ date, time, activity, notes });
      expect(seen.has(fp)).toBe(false);
      seen.add(fp);
    }
    expect(seen.size).toBe(2_000);
  });
});
