/**
 * Contract tests for the task list DTOs.
 *
 * These guards stop silent drift on the /api/tasks client payload:
 *   - `userId` must not appear on either the list or detail DTO.
 *   - `classificationAssociations` is stripped from the list DTO
 *     (replaced by `classificationExtraCount`) but preserved on detail.
 *   - List items retain every editable field TaskForm needs so the
 *     edit dialog doesn't have to refetch the full row.
 *
 * If someone adds a new internal-only field to `shared/schema/tasks.ts`
 * they'll need to update this test to opt in or opt out of the DTO.
 */
import { describe, expect, it } from "vitest";
import {
  toPublicTaskListItem,
  toPublicTaskListItems,
  toPublicTaskDetail,
} from "./public-client-dtos";
import type { Task } from "./schema";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t-1",
    userId: "u-1",
    date: "2026-04-19",
    time: null,
    activity: "Write perf pass 3",
    notes: "",
    urgency: 3,
    impact: 3,
    effort: 2,
    prerequisites: "",
    recurrence: "none",
    priority: "medium",
    priorityScore: 55,
    classification: "Work",
    classificationAssociations: [
      { label: "Work", confidence: 0.8 },
      { label: "Admin", confidence: 0.6 },
      { label: "Deep Work", confidence: 0.4 },
    ],
    status: "pending",
    isRepeated: false,
    sortOrder: 0,
    visibility: "private",
    communityShowNotes: false,
    createdAt: new Date("2026-04-19T00:00:00Z"),
    updatedAt: new Date("2026-04-19T01:00:00Z"),
    ...overrides,
  } as Task;
}

describe("toPublicTaskListItem", () => {
  it("drops userId and the associations array, keeps every editable field", () => {
    const slim = toPublicTaskListItem(makeTask());
    expect("userId" in slim).toBe(false);
    expect("classificationAssociations" in slim).toBe(false);
    /* TaskForm needs these — regression-guard they stay on the list DTO. */
    expect(slim.date).toBe("2026-04-19");
    expect(slim.activity).toBe("Write perf pass 3");
    expect(slim.urgency).toBe(3);
    expect(slim.impact).toBe(3);
    expect(slim.effort).toBe(2);
    expect(slim.prerequisites).toBe("");
    expect(slim.recurrence).toBe("none");
    expect(slim.priority).toBe("medium");
    expect(slim.priorityScore).toBe(55);
    expect(slim.classification).toBe("Work");
    expect(slim.visibility).toBe("private");
    expect(slim.communityShowNotes).toBe(false);
  });

  it("reports classificationExtraCount = associations.length - 1 when present", () => {
    const slim = toPublicTaskListItem(makeTask());
    expect(slim.classificationExtraCount).toBe(2);
  });

  it("clamps classificationExtraCount to 0 when associations are empty or null", () => {
    const withEmpty = toPublicTaskListItem(
      makeTask({ classificationAssociations: [] }),
    );
    expect(withEmpty.classificationExtraCount).toBe(0);

    const withNull = toPublicTaskListItem(
      makeTask({ classificationAssociations: null }),
    );
    expect(withNull.classificationExtraCount).toBe(0);
  });

  it("toPublicTaskListItems maps arrays shape-for-shape", () => {
    const list = toPublicTaskListItems([
      makeTask({ id: "a" }),
      makeTask({ id: "b", classificationAssociations: null }),
    ]);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe("a");
    expect(list[0].classificationExtraCount).toBe(2);
    expect(list[1].id).toBe("b");
    expect(list[1].classificationExtraCount).toBe(0);
  });
});

describe("toPublicTaskDetail", () => {
  it("drops userId but keeps the full classificationAssociations array", () => {
    const detail = toPublicTaskDetail(makeTask());
    expect("userId" in detail).toBe(false);
    expect(detail.classificationAssociations).toHaveLength(3);
    expect(detail.classificationAssociations?.[0]).toEqual({
      label: "Work",
      confidence: 0.8,
    });
  });
});

describe("bandwidth-savings sanity check", () => {
  /* Soft assertion: a 3-association list item must be meaningfully
   * smaller than the raw task. If someone accidentally copies the
   * associations back onto the list DTO, this will catch it. */
  it("list DTO JSON is smaller than the raw task JSON for typical rows", () => {
    const raw = makeTask();
    const slim = toPublicTaskListItem(raw);
    expect(JSON.stringify(slim).length).toBeLessThan(
      JSON.stringify(raw).length,
    );
  });
});
