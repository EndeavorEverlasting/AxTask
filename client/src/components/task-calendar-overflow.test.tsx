import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import type { Task } from "@shared/schema";
import { CalendarCell } from "./task-calendar";

function makeTask(index: number): Task {
  return {
    id: `calendar-overflow-task-${index}`,
    date: "2026-09-10",
    time: `${String(index + 8).padStart(2, "0")}:00`,
    activity: `Overflow task ${index + 1}`,
    priority: "Low",
    status: "pending",
  } as Task;
}

afterEach(() => {
  cleanup();
});

describe("CalendarCell task overflow", () => {
  it("keeps every task reachable and lets users click tasks beyond the first three", () => {
    const tasks = Array.from({ length: 5 }, (_, index) => makeTask(index));
    const onClickTask = vi.fn();
    const onClickDate = vi.fn();

    render(
      <DndContext>
        <CalendarCell
          date={new Date("2026-09-10T12:00:00Z")}
          isToday={false}
          isCurrentMonth={true}
          tasks={tasks}
          onClickDate={onClickDate}
          onClickTask={onClickTask}
        />
      </DndContext>,
    );

    const taskRegion = screen.getByRole("region", { name: "5 tasks on 2026-09-10" });
    expect(taskRegion).toHaveClass("overflow-y-auto", "overscroll-contain", "max-h-[72px]");
    expect(taskRegion).toHaveAttribute("tabindex", "0");

    const hiddenBeforeFix = screen.getByTitle("12:00 — Overflow task 5");
    expect(hiddenBeforeFix).toBeInTheDocument();

    fireEvent.click(hiddenBeforeFix);

    expect(onClickTask).toHaveBeenCalledTimes(1);
    expect(onClickTask).toHaveBeenCalledWith(tasks[4]);
    expect(onClickDate).not.toHaveBeenCalled();
  });
});
