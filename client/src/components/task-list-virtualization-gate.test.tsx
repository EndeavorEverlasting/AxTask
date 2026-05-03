import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  shouldVirtualizeTaskList,
  TASK_LIST_VIRTUALIZE_THRESHOLD,
} from "@/lib/task-list-performance";

function Gate({ rowCount }: { rowCount: number }) {
  return (
    <span data-testid="virtualize">{shouldVirtualizeTaskList(rowCount) ? "virtual" : "full"}</span>
  );
}

describe("TaskList virtualization gate (RTL)", () => {
  it("switches from full list to virtual window after the threshold", () => {
    const { rerender } = render(<Gate rowCount={TASK_LIST_VIRTUALIZE_THRESHOLD} />);
    expect(screen.getByTestId("virtualize")).toHaveTextContent("full");
    rerender(<Gate rowCount={TASK_LIST_VIRTUALIZE_THRESHOLD + 1} />);
    expect(screen.getByTestId("virtualize")).toHaveTextContent("virtual");
  });
});
