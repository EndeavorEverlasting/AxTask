import { describe, expect, it } from "vitest";
import { parseTasksFromCSV } from "./csv-utils";

describe("Sunday task CSV import contract", () => {
  it("accepts the published eight-column task population shape", () => {
    const csv = [
      "date,activity,notes,urgency,impact,effort,prerequisites,status",
      '2026-09-06,Prepare correspondence,"Review, seal, and stage for mailing",5,5,2,Envelope; postage,pending',
      "2026-09-06,Complete household reset,Basic reset for the coming week,3,3,3,,completed",
    ].join("\n");

    const tasks = parseTasksFromCSV(csv);

    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({
      date: "2026-09-06",
      activity: "Prepare correspondence",
      notes: "Review, seal, and stage for mailing",
      urgency: 5,
      impact: 5,
      effort: 2,
      prerequisites: "Envelope; postage",
      status: "pending",
    });
    expect(tasks[1]).toMatchObject({
      date: "2026-09-06",
      activity: "Complete household reset",
      urgency: 3,
      impact: 3,
      effort: 3,
      prerequisites: "",
      status: "completed",
    });
  });
});
