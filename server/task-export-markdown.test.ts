// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Task } from "@shared/schema";
import { buildTaskReportMarkdown } from "./task-export-generators";

describe("buildTaskReportMarkdown", () => {
  it("includes activity and metadata", () => {
    const task = {
      id: "t1",
      userId: "u",
      date: "2026-04-01",
      time: "09:30",
      activity: "Ship **report**",
      notes: "Details here",
      status: "completed",
      priority: "High",
      classification: "Development",
      recurrence: "none",
      priorityScore: 80,
      isRepeated: false,
      sortOrder: 0,
      visibility: "private",
      communityShowNotes: false,
      prerequisites: "",
      classificationAssociations: null,
      dependsOn: null,
      durationMinutes: null,
      startDate: null,
      endDate: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Task;
    const md = buildTaskReportMarkdown(task, "Test User");
    expect(md).toContain("Ship **report**");
    expect(md).toContain("2026-04-01");
    expect(md).toContain("Test User");
    expect(md).toContain("completed");
  });
});
