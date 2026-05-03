import { describe, it, expect, vi } from "vitest";
import { 
  TASK_FIELD_FLOW, 
  getFirstFieldId, 
  getNextFieldId, 
  isResizableField 
} from "../../client/src/lib/task-field-flow-registry";
import { renderHook, act } from "@testing-library/react";
import { useFieldResize } from "../../client/src/hooks/use-field-resize";
import { useTaskFocusFlow } from "../../client/src/hooks/use-task-focus-flow";

describe("Task Field Flow Registry", () => {
  it("defines the correct field order", () => {
    expect(TASK_FIELD_FLOW[0].id).toBe("activity");
    expect(TASK_FIELD_FLOW[1].id).toBe("notes");
    expect(TASK_FIELD_FLOW[2].id).toBe("prerequisites");
  });

  it("identifies resizable fields", () => {
    expect(isResizableField("activity")).toBe(false);
    expect(isResizableField("notes")).toBe(true);
    expect(isResizableField("prerequisites")).toBe(true);
  });

  it("cycles fields correctly", () => {
    expect(getFirstFieldId()).toBe("activity");
    expect(getNextFieldId("activity")).toBe("notes");
    expect(getNextFieldId("notes")).toBe("prerequisites");
    expect(getNextFieldId("prerequisites")).toBe(null);
  });
});

describe("useFieldResize", () => {
  it("verifies default height", () => {
    const { result } = renderHook(() => useFieldResize("notes", 120));
    expect(result.current.height).toBe(120);
  });
});

describe("useTaskFocusFlow", () => {
  it("exposes focus functions", () => {
    const { result } = renderHook(() => useTaskFocusFlow());
    expect(typeof result.current.registerField).toBe("function");
    expect(typeof result.current.focusFirst).toBe("function");
    expect(typeof result.current.cycleNext).toBe("function");
  });
});
