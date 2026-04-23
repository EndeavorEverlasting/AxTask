// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Task } from "@shared/schema";
import {
  buildSharedShoppingListHtmlDocument,
  buildShoppingListHtmlDocument,
  buildShoppingListSpreadsheetBuffer,
  filterShoppingTasks,
} from "./shopping-list-export-generators";

function task(partial: Partial<Task> & Pick<Task, "id" | "activity" | "classification" | "date" | "status">): Task {
  return {
    userId: "u1",
    time: null,
    notes: "",
    urgency: null,
    impact: null,
    effort: null,
    prerequisites: "",
    recurrence: "none",
    priority: "Low",
    priorityScore: 0,
    isRepeated: false,
    sortOrder: 0,
    visibility: "private",
    communityShowNotes: false,
    startDate: null,
    endDate: null,
    durationMinutes: null,
    dependsOn: null,
    classificationAssociations: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  } as Task;
}

describe("shopping-list-export-generators", () => {
  it("filterShoppingTasks keeps Shopping classification", () => {
    const rows = [
      task({ id: "1", activity: "x", classification: "Shopping", date: "2026-01-01", status: "pending" }),
      task({ id: "2", activity: "report", classification: "Work", date: "2026-01-01", status: "pending" }),
    ];
    expect(filterShoppingTasks(rows)).toHaveLength(1);
    expect(filterShoppingTasks(rows)[0].id).toBe("1");
  });

  it("HTML escapes activity text and includes checkboxes", () => {
    const rows = [
      task({
        id: "1",
        activity: 'Buy <script>alert(1)</script> milk',
        classification: "Shopping",
        date: "2026-01-01",
        status: "pending",
      }),
    ];
    const html = buildShoppingListHtmlDocument(rows);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("CSV marks purchased column FALSE for pending tasks", () => {
    const rows = [
      task({
        id: "1",
        activity: "Eggs",
        classification: "Shopping",
        date: "2026-01-02",
        status: "pending",
      }),
    ];
    const buf = buildShoppingListSpreadsheetBuffer(rows, "csv");
    const text = buf.toString("utf8");
    expect(text.split("\r\n")[0]).toContain("Purchased");
    expect(text).toContain("FALSE");
    expect(text).toContain("Eggs");
  });

  it("shared list HTML uses purchased styling class", () => {
    const html = buildSharedShoppingListHtmlDocument(
      [
        { label: "Tea", notes: "", purchased: false },
        { label: "Coffee", notes: "", purchased: true },
      ],
      "Pantry restock",
    );
    expect(html).toContain("Pantry restock");
    expect(html).toContain('class="purchased"');
    expect(html).toContain("disabled checked");
  });
});
