import { describe, expect, it } from "vitest";
import {
  readTaskListRouteFilters,
  buildTaskListHref,
  taskMatchesRouteFilter,
  describeRouteFilter,
} from "./task-list-route-filters";
import type { Task } from "@shared/schema";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "t",
    userId: "u",
    date: overrides.date ?? "2026-04-19",
    time: null,
    priority: "medium",
    activity: "x",
    notes: null,
    classification: "work",
    classificationAssociations: [],
    priorityScore: 50,
    status: "pending",
    recurrence: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as unknown as Task;
}

describe("task-list-route-filters", () => {
  describe("readTaskListRouteFilters", () => {
    it("returns defaults on no params", () => {
      expect(readTaskListRouteFilters("")).toEqual({ filter: "none", q: "" });
    });

    it("parses a valid filter + query", () => {
      expect(
        readTaskListRouteFilters("?filter=overdue&q=report"),
      ).toEqual({ filter: "overdue", q: "report" });
    });

    it("rejects unknown filter values to 'none' so we don't silently apply garbage", () => {
      expect(readTaskListRouteFilters("?filter=nuke")).toEqual({
        filter: "none",
        q: "",
      });
    });

    it("accepts each known filter verb", () => {
      for (const f of ["overdue", "today", "week", "pending"]) {
        expect(readTaskListRouteFilters(`?filter=${f}`).filter).toBe(f);
      }
    });
  });

  describe("buildTaskListHref", () => {
    it("returns /tasks with no params when filter is none", () => {
      expect(buildTaskListHref("none")).toBe("/tasks");
    });
    it("encodes filter + q", () => {
      expect(buildTaskListHref("overdue", "bug fix")).toBe(
        "/tasks?filter=overdue&q=bug+fix",
      );
    });
  });

  describe("taskMatchesRouteFilter", () => {
    const now = new Date("2026-04-19T12:00:00Z");

    it("'overdue' matches pending/in-progress tasks dated before today", () => {
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2026-04-10", status: "pending" }),
          "overdue",
          now,
        ),
      ).toBe(true);
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2026-04-10", status: "completed" }),
          "overdue",
          now,
        ),
      ).toBe(false);
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2026-04-19", status: "pending" }),
          "overdue",
          now,
        ),
      ).toBe(false);
    });

    it("'today' matches only tasks with today's date", () => {
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2026-04-19" }),
          "today",
          now,
        ),
      ).toBe(true);
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2026-04-20" }),
          "today",
          now,
        ),
      ).toBe(false);
    });

    it("'pending' matches any non-completed task regardless of date", () => {
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2030-01-01", status: "pending" }),
          "pending",
          now,
        ),
      ).toBe(true);
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2030-01-01", status: "completed" }),
          "pending",
          now,
        ),
      ).toBe(false);
    });

    it("'week' matches tasks within the current week window", () => {
      // 2026-04-19 is a Sunday — start-of-week is same day, end-of-week is 2026-04-25
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2026-04-19" }),
          "week",
          now,
        ),
      ).toBe(true);
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2026-04-25" }),
          "week",
          now,
        ),
      ).toBe(true);
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2026-04-18" }),
          "week",
          now,
        ),
      ).toBe(false);
      expect(
        taskMatchesRouteFilter(
          makeTask({ date: "2026-04-26" }),
          "week",
          now,
        ),
      ).toBe(false);
    });

    it("'none' is a pass-through", () => {
      expect(
        taskMatchesRouteFilter(makeTask({ date: "1999-01-01" }), "none"),
      ).toBe(true);
    });
  });

  describe("describeRouteFilter", () => {
    it("has a human label for each non-'none' filter", () => {
      expect(describeRouteFilter("overdue")).toBe("Overdue");
      expect(describeRouteFilter("today")).toBe("Due today");
      expect(describeRouteFilter("week")).toBe("This week");
      expect(describeRouteFilter("pending")).toBe("All pending");
      expect(describeRouteFilter("none")).toBe("");
    });
  });
});
