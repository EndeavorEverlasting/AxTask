import { describe, expect, it } from "vitest";
import { insertTaskSchema, TASK_NOTES_MAX_CHARS } from "./schema";

describe("insertTaskSchema notes length", () => {
  const base = {
    date: "2026-04-18",
    activity: "Test",
    notes: "",
    recurrence: "none" as const,
    status: "pending" as const,
    visibility: "private" as const,
    communityShowNotes: false,
  };

  it("allows notes up to TASK_NOTES_MAX_CHARS", () => {
    const notes = "x".repeat(TASK_NOTES_MAX_CHARS);
    const r = insertTaskSchema.safeParse({ ...base, notes });
    expect(r.success).toBe(true);
  });

  it("rejects notes over TASK_NOTES_MAX_CHARS", () => {
    const notes = "x".repeat(TASK_NOTES_MAX_CHARS + 1);
    const r = insertTaskSchema.safeParse({ ...base, notes });
    expect(r.success).toBe(false);
  });
});
