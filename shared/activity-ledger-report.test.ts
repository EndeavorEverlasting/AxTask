import { describe, expect, it } from "vitest";
import type { Task } from "./schema";
import {
  ACTIVITY_LEDGER_CONTRACT_VERSION,
  buildActivityKey,
  normalizeLedgerActivity,
  projectTaskToActivity,
} from "./activity-ledger";
import { buildActivityReportHtml, buildTaskActivityReport } from "./activity-report";

function task(overrides: Partial<Task> & Pick<Task, "id" | "date" | "activity">): Task {
  return {
    id: overrides.id,
    userId: "user-1",
    date: overrides.date,
    time: null,
    activity: overrides.activity,
    notes: "private notes must never enter the showcase report",
    urgency: null,
    impact: null,
    effort: null,
    prerequisites: "",
    recurrence: "none",
    priority: "medium",
    priorityScore: 50,
    classification: "Work",
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
    deadlineType: null,
    createdAt: new Date("2026-01-01T12:00:00Z"),
    updatedAt: new Date("2026-01-01T12:00:00Z"),
    deletedAt: null,
    deletedBy: null,
    deleteReason: null,
    purgeAfter: null,
    restoreCount: 0,
    ...overrides,
  } as Task;
}

describe("activity ledger contract", () => {
  it("keeps identity stable when mutable activity prose changes", () => {
    const first = buildActivityKey("drive", "client-ledger", "row-42");
    const second = buildActivityKey("drive", "client-ledger", "row-42");
    expect(first).toBe(second);

    const normalized = normalizeLedgerActivity({
      schemaVersion: ACTIVITY_LEDGER_CONTRACT_VERSION,
      entryId: "row-42",
      sourceSystem: "drive",
      sourceLedger: "client-ledger",
      title: "Deploy release",
      status: "completed",
      createdAt: "2026-01-02T09:00:00-05:00",
      updatedAt: "2026-01-03T12:00:00-05:00",
      completedAt: "2026-01-03T11:45:00-05:00",
      visibility: "public",
    });

    expect(normalized.activityKey).toBe(first);
    expect(normalized.activityDate).toBe("2026-01-03");
    expect(normalized.temporalBasis).toBe("completed-at");
    expect(normalized.temporalConfidence).toBe("observed");
  });

  it("labels the current task projection as declared task-date evidence", () => {
    const record = projectTaskToActivity(task({
      id: "task-1",
      date: "2026-02-10",
      activity: "Coordinate deployment",
      status: "completed",
    }));

    expect(record.status).toBe("completed");
    expect(record.activityDate).toBe("2026-02-10");
    expect(record.temporalBasis).toBe("task-date");
    expect(record.temporalConfidence).toBe("declared");
  });
});

describe("activity report", () => {
  const tasks = [
    task({
      id: "jan-public",
      date: "2026-01-03",
      activity: "Published client rollout",
      status: "completed",
      visibility: "public",
      classification: "Client",
    }),
    task({
      id: "mar-pending",
      date: "2026-03-15",
      activity: "Plan migration",
      status: "pending",
      classification: "Infrastructure",
    }),
    task({
      id: "may-private",
      date: "2026-05-31",
      activity: "Confidential director work",
      status: "completed",
      visibility: "private",
      classification: "Client",
    }),
    task({
      id: "june-outside",
      date: "2026-06-01",
      activity: "Outside range",
      status: "completed",
      visibility: "public",
      classification: "Other",
    }),
  ];

  it("uses an inclusive deterministic date range and stable ordering", () => {
    const report = buildTaskActivityReport(tasks, { from: "2026-01-01", to: "2026-05-31" });

    expect(report.totals.activities).toBe(3);
    expect(report.totals.completed).toBe(2);
    expect(report.totals.planned).toBe(1);
    expect(report.totals.activeDays).toBe(3);
    expect(report.totals.completionRate).toBe(67);
    expect(report.byMonth.map((row) => row.month)).toEqual(["2026-01", "2026-03", "2026-05"]);
    expect(report.byClassification).toEqual([
      { classification: "Client", total: 2, completed: 2 },
      { classification: "Infrastructure", total: 1, completed: 0 },
    ]);
  });

  it("redacts private detail from showcase output without hiding aggregate work", () => {
    const report = buildTaskActivityReport(
      tasks,
      { from: "2026-01-01", to: "2026-05-31" },
      "showcase",
    );
    const html = buildActivityReportHtml(report);

    expect(report.totals.activities).toBe(3);
    expect(report.totals.completed).toBe(2);
    expect(report.highlights.map((item) => item.title)).toEqual(["Published client rollout"]);
    expect(report.privateHighlightsWithheld).toBe(1);
    expect(html).toContain("Published client rollout");
    expect(html).not.toContain("Confidential director work");
    expect(html).not.toContain("private notes must never enter the showcase report");
  });

  it("rejects reversed ranges instead of silently changing the user's question", () => {
    expect(() => buildTaskActivityReport(tasks, { from: "2026-05-31", to: "2026-01-01" })).toThrow(
      "from must be on or before to",
    );
  });
});
