// @vitest-environment jsdom
/**
 * Real-DOM regression guard for the /tasks fatal bug.
 *
 * The previous perf pass shipped PretextImperativeList with a `<tr>`
 * template that relied on `<template>.innerHTML = "<tr>..."`. The HTML
 * parser drops orphan `<tr>` tokens in "in body" insertion mode, which
 * left `<td>` children as loose text (the "orphaned Repeat / Ship chips"
 * the user reported) and zero actual rows in `<tbody>`. Search was
 * broken because matching rows never existed.
 *
 * This test mounts the real TaskListHost (no controller mocks) against
 * a prefilled React Query cache and asserts:
 *   - real `<tr data-task-id="…">` elements land in the tbody for each
 *     task, with the activity text bound,
 *   - typing into the search input narrows the row set,
 *   - the empty state renders when the cache is truly empty,
 *   - a saved-filter chip renders + clears when `?filter=overdue` is in
 *     the URL, and `overdue` narrows correctly.
 *
 * If the template regresses again, every assertion here fails loudly.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskListHost } from "./task-list-host";
import type { Task } from "@shared/schema";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? "task-a",
    userId: "u1",
    date: overrides.date ?? "2026-04-19",
    time: null,
    priority: overrides.priority ?? "medium",
    activity: overrides.activity ?? "Write the report",
    notes: overrides.notes ?? null,
    classification: overrides.classification ?? "work",
    classificationAssociations: [],
    priorityScore: overrides.priorityScore ?? 72,
    status: (overrides.status ?? "pending") as Task["status"],
    recurrence: overrides.recurrence ?? null,
    createdAt: new Date("2026-04-18T12:00:00Z"),
    updatedAt: new Date("2026-04-18T12:00:00Z"),
    ...overrides,
  } as unknown as Task;
}

function mount(tasks: Task[]): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 1000 * 60, refetchInterval: false },
    },
  });
  client.setQueryData(["/api/tasks"], tasks);
  render(
    <QueryClientProvider client={client}>
      <TaskListHost />
    </QueryClientProvider>,
  );
  return client;
}

describe("TaskListHost :: real-DOM regression", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    /* Prevent the on-mount `refetch()` from hitting a real network in
     * the happy path where the cache is already populated. The stale
     * check gates that refetch on `tasks.length === 0`. */
    globalThis.fetch = vi.fn(async () => new Response("[]", { status: 200 })) as typeof fetch;
    window.history.replaceState({}, "", "/tasks");
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it("renders a real <tr data-task-id=\"…\"> per task with activity text bound", async () => {
    mount([
      makeTask({ id: "a", activity: "Write the report" }),
      makeTask({ id: "b", activity: "Ship the release" }),
    ]);

    const tbody = await screen.findByTestId("task-list-body");
    await waitFor(() => {
      const rows = tbody.querySelectorAll<HTMLTableRowElement>("tr[data-task-id]");
      expect(rows.length).toBe(2);
    });

    const rowA = tbody.querySelector<HTMLTableRowElement>("tr[data-task-id='a']")!;
    const rowB = tbody.querySelector<HTMLTableRowElement>("tr[data-task-id='b']")!;
    expect(rowA).toBeTruthy();
    expect(rowB).toBeTruthy();
    /* Sanity: the actual row element is a <tr> (not a stray <td>/<span>
     * left loose by a dropped-<tr> parser bug). */
    expect(rowA.tagName).toBe("TR");
    expect(rowB.tagName).toBe("TR");
    expect(rowA.querySelector(".axtask-cell-activity")?.textContent).toBe(
      "Write the report",
    );
    expect(rowB.querySelector(".axtask-cell-activity")?.textContent).toBe(
      "Ship the release",
    );
  });

  it("search narrows rendered rows in the tbody", async () => {
    mount([
      makeTask({ id: "a", activity: "Write the report" }),
      makeTask({ id: "b", activity: "Ship the release" }),
    ]);

    const tbody = await screen.findByTestId("task-list-body");
    await waitFor(() =>
      expect(tbody.querySelectorAll("tr[data-task-id]").length).toBe(2),
    );

    const search = screen.getByTestId("task-search") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "report" } });

    await waitFor(() => {
      const rows = tbody.querySelectorAll<HTMLTableRowElement>("tr[data-task-id]");
      expect(rows.length).toBe(1);
      expect(rows[0]?.dataset.taskId).toBe("a");
    });
  });

  it("shows an empty state (not a blank surface) when the cache is empty and not fetching", async () => {
    /* Pre-populate with [] but mark it fresh so the mount refetch doesn't
     * replace it. The empty-state element is the user-visible signal
     * that /tasks isn't silently broken. */
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 1000 * 60 } },
    });
    client.setQueryData(["/api/tasks"], []);
    render(
      <QueryClientProvider client={client}>
        <TaskListHost />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("task-list-empty")).toBeTruthy();
    });
  });

  it("hydrates ?filter=overdue from the URL, renders a dismissable chip, and narrows rows", async () => {
    window.history.replaceState({}, "", "/tasks?filter=overdue");
    mount([
      makeTask({ id: "old", activity: "Late thing", date: "2020-01-01", status: "pending" }),
      makeTask({ id: "new", activity: "Current thing", date: "2099-01-01", status: "pending" }),
    ]);

    const tbody = await screen.findByTestId("task-list-body");
    await waitFor(() => {
      const rows = tbody.querySelectorAll<HTMLTableRowElement>("tr[data-task-id]");
      expect(rows.length).toBe(1);
      expect(rows[0]?.dataset.taskId).toBe("old");
    });

    expect(screen.getByTestId("task-list-route-chip")).toHaveTextContent("Overdue");
    fireEvent.click(screen.getByTestId("task-list-route-chip-clear"));

    await waitFor(() => {
      const rows = tbody.querySelectorAll<HTMLTableRowElement>("tr[data-task-id]");
      expect(rows.length).toBe(2);
    });
  });
});
