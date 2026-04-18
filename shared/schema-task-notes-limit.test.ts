import { describe, expect, it } from "vitest";
import { insertTaskSchema } from "./schema";

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

  it("allows notes up to 10000 characters", () => {
    const notes = "x".repeat(10000);
    const r = insertTaskSchema.safeParse({ ...base, notes });
    expect(r.success).toBe(true);
  });

  it("rejects notes over 10000 characters", () => {
    const notes = "x".repeat(10001);
    const r = insertTaskSchema.safeParse({ ...base, notes });
    expect(r.success).toBe(false);
  });
});
