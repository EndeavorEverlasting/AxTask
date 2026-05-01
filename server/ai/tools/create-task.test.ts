// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCreateTaskIntent } from "./create-task";

const createTaskMock = vi.fn();
const assertCanCreateTasksMock = vi.fn();

vi.mock("../../storage", () => ({
  storage: {
    createTask: (...args: unknown[]) => createTaskMock(...args),
  },
  assertCanCreateTasks: (...args: unknown[]) => assertCanCreateTasksMock(...args),
}));

describe("executeCreateTaskIntent", () => {
  beforeEach(() => {
    createTaskMock.mockReset();
    assertCanCreateTasksMock.mockReset();
  });

  it("returns clarification when quota blocks creation", async () => {
    assertCanCreateTasksMock.mockResolvedValue({ ok: false, message: "limit" });

    const result = await executeCreateTaskIntent("u1", {
      type: "create_task",
      payload: { activity: "Thing", notes: null },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("quota_exceeded");
    expect(createTaskMock).not.toHaveBeenCalled();
  });

  it("creates task with activity", async () => {
    assertCanCreateTasksMock.mockResolvedValue({ ok: true });
    createTaskMock.mockResolvedValue({
      id: "task-1",
      activity: "Vacuum",
    });

    const result = await executeCreateTaskIntent("u1", {
      type: "create_task",
      payload: { activity: "Vacuum", notes: null },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.taskId).toBe("task-1");
    expect(createTaskMock).toHaveBeenCalledTimes(1);
  });
});
