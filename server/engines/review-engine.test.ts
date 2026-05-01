import { describe, expect, it } from "vitest";
import { processTaskReview } from "./review-engine";
import { RETRO_VOICE_PLACEHOLDER_TASK_ID } from "@shared/retro-voice-review";
import type { Task } from "@shared/schema";

const now = new Date("2026-04-27T12:00:00.000Z");

describe("processTaskReview retro log", () => {
  it("proposes create_and_complete when no pending task matches", () => {
    const out = processTaskReview("I completed a meeting today", [], now);
    expect(out.actions).toHaveLength(1);
    const a = out.actions[0];
    expect(a.type).toBe("create_and_complete");
    expect(a.taskId).toBe(RETRO_VOICE_PLACEHOLDER_TASK_ID);
    expect(a.taskActivity.toLowerCase()).toContain("meeting");
    expect(a.details.date).toBe("2026-04-27");
    expect(typeof a.actionId).toBe("string");
    expect(out.unmatched).toHaveLength(0);
  });

  it("prefers completing an existing pending task over retro", () => {
    const pending = [
      {
        id: "t1",
        userId: "u1",
        date: "2026-04-27",
        time: "",
        activity: "Team meeting",
        notes: "",
        urgency: 3,
        impact: 3,
        effort: 3,
        prerequisites: "",
        recurrence: "none",
        priority: "Medium",
        priorityScore: 50,
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
        createdAt: now,
        updatedAt: now,
      },
    ] as Task[];
    const out = processTaskReview("I completed the team meeting today", pending, now);
    expect(out.actions.some((x) => x.type === "complete")).toBe(true);
    expect(out.actions.some((x) => x.type === "create_and_complete")).toBe(false);
  });
});
