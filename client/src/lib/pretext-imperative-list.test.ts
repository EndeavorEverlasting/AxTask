import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PretextImperativeList,
  type ImperativeRowTask,
  type RowEvent,
} from "./pretext-imperative-list";
import { PerfLedger } from "./perf-ledger";

function makeTask(overrides: Partial<ImperativeRowTask> = {}): ImperativeRowTask {
  return {
    id: "t1",
    date: "2026-04-19",
    createdAt: "Apr 18, 12:00",
    updatedAt: "Apr 18, 12:00",
    priority: "medium",
    activity: "Write imperative list",
    notes: "",
    classification: "work",
    classificationExtraCount: 0,
    priorityScoreTenths: 72,
    status: "pending",
    recurrence: null,
    ...overrides,
  };
}

function mount() {
  document.body.innerHTML = "";
  const table = document.createElement("table");
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);
  document.body.appendChild(table);
  return { table, tbody };
}

describe("PretextImperativeList", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("tags the tbody with data-axtask-surface", () => {
    const { tbody } = mount();
    const list = new PretextImperativeList(tbody, { onRowEvent: () => {} });
    expect(tbody.dataset.axtaskSurface).toBe("task-list");
    list.destroy();
  });

  it("creates exactly one <tr> per task and keyed DOM nodes are reused across updates", () => {
    const { tbody } = mount();
    const list = new PretextImperativeList(tbody, { onRowEvent: () => {} });

    const tasks = [makeTask({ id: "a" }), makeTask({ id: "b", activity: "b" })];
    list.setTasks(tasks);
    expect(tbody.children.length).toBe(2);
    const firstRow = tbody.querySelector<HTMLTableRowElement>("tr[data-task-id='a']")!;

    list.setTasks([{ ...tasks[0]!, activity: "updated" }, tasks[1]!]);
    expect(tbody.children.length).toBe(2);
    const rowAgain = tbody.querySelector<HTMLTableRowElement>("tr[data-task-id='a']")!;
    expect(rowAgain).toBe(firstRow);
    expect(rowAgain.querySelector(".axtask-cell-activity")?.textContent).toBe("updated");

    list.destroy();
  });

  it("reorders rows by swapping siblings, not by re-creating them", () => {
    const { tbody } = mount();
    const list = new PretextImperativeList(tbody, { onRowEvent: () => {} });
    const a = makeTask({ id: "a" });
    const b = makeTask({ id: "b" });
    const c = makeTask({ id: "c" });
    list.setTasks([a, b, c]);
    const rowA = tbody.querySelector("tr[data-task-id='a']")!;
    const rowB = tbody.querySelector("tr[data-task-id='b']")!;
    const rowC = tbody.querySelector("tr[data-task-id='c']")!;

    list.setTasks([c, a, b]);
    const order = Array.from(tbody.children).map(
      (c) => (c as HTMLElement).dataset.taskId,
    );
    expect(order).toEqual(["c", "a", "b"]);
    expect(tbody.querySelector("tr[data-task-id='a']")).toBe(rowA);
    expect(tbody.querySelector("tr[data-task-id='b']")).toBe(rowB);
    expect(tbody.querySelector("tr[data-task-id='c']")).toBe(rowC);

    list.destroy();
  });

  it("removes rows that disappear from the incoming task array", () => {
    const { tbody } = mount();
    const list = new PretextImperativeList(tbody, { onRowEvent: () => {} });
    list.setTasks([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    list.setTasks([makeTask({ id: "b" })]);
    expect(tbody.children.length).toBe(1);
    expect(tbody.querySelector("tr[data-task-id='a']")).toBeNull();
    list.destroy();
  });

  it("delegates click events to onRowEvent with the right action + taskId", () => {
    const { tbody } = mount();
    const events: RowEvent[] = [];
    const list = new PretextImperativeList(tbody, {
      onRowEvent: (ev) => events.push(ev),
    });
    list.setTasks([makeTask({ id: "t1" })]);
    const deleteBtn = tbody.querySelector<HTMLButtonElement>(
      "button[data-action='delete']",
    )!;
    deleteBtn.click();
    expect(events.length).toBe(1);
    expect(events[0]!.action).toBe("delete");
    expect(events[0]!.taskId).toBe("t1");

    const row = tbody.querySelector<HTMLTableRowElement>("tr[data-task-id='t1']")!;
    row.click();
    expect(events.at(-1)!.action).toBe("open");

    list.destroy();
  });

  it("exposes the drag-handle cell only when dragMode is enabled", () => {
    const { tbody } = mount();
    const list = new PretextImperativeList(tbody, {
      onRowEvent: () => {},
      dragMode: false,
    });
    list.setTasks([makeTask({ id: "a" })]);
    const dragCell = tbody.querySelector<HTMLElement>(".axtask-drag-cell")!;
    expect(dragCell.classList.contains("hidden")).toBe(true);

    list.setDragMode(true);
    expect(dragCell.classList.contains("hidden")).toBe(false);

    list.setDragMode(false);
    expect(dragCell.classList.contains("hidden")).toBe(true);
    list.destroy();
  });

  it("reports a task-list update mark to the perf ledger with row count", () => {
    const { tbody } = mount();
    const ledger = new PerfLedger({ capacity: 32 });
    const list = new PretextImperativeList(tbody, {
      onRowEvent: () => {},
      ledger,
    });
    list.setTasks([makeTask({ id: "a" }), makeTask({ id: "b" })]);
    const snap = ledger.snapshot();
    const row = snap.rows.find((r) => r.surface === "task-list")!;
    expect(row.updates).toBe(1);
    expect(row.maxRowCount).toBe(2);
    list.destroy();
  });

  it("destroy() clears rows and detaches event listeners", () => {
    const { tbody } = mount();
    const spy = vi.fn();
    const list = new PretextImperativeList(tbody, { onRowEvent: spy });
    list.setTasks([makeTask({ id: "a" })]);
    list.destroy();
    expect(tbody.children.length).toBe(0);
    const evt = new MouseEvent("click", { bubbles: true });
    tbody.dispatchEvent(evt);
    expect(spy).not.toHaveBeenCalled();
  });

  it("renders recurrence, notes, classification extras, status correctly", () => {
    const { tbody } = mount();
    const list = new PretextImperativeList(tbody, { onRowEvent: () => {} });
    list.setTasks([
      makeTask({
        id: "a",
        recurrence: "weekly",
        notes: "Remember to bring the report",
        classificationExtraCount: 2,
        status: "completed",
      }),
    ]);
    const row = tbody.querySelector<HTMLTableRowElement>("tr[data-task-id='a']")!;
    expect(row.querySelector(".axtask-cell-recurrence")?.textContent).toBe(
      "weekly",
    );
    expect(row.querySelector(".axtask-cell-notes")?.textContent).toContain(
      "report",
    );
    expect(
      row.querySelector(".axtask-cell-classification-extra")?.textContent,
    ).toBe("+2");
    expect(row.dataset.status).toBe("completed");
    expect(row.querySelector(".axtask-cell-status")?.textContent).toBe("Completed");
    list.destroy();
  });
});
