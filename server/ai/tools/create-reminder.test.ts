// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCreateReminderIntent } from "./create-reminder";

const resolvePlaceAliasMock = vi.fn();
const createReminderWithTriggerMock = vi.fn();
const createTaskReminderMock = vi.fn();
const getTaskOwnedByUserMock = vi.fn();

vi.mock("../../storage/locations", () => ({
  resolvePlaceAlias: (...args: unknown[]) => resolvePlaceAliasMock(...args),
}));

vi.mock("../../storage/reminders", () => ({
  createReminderWithTrigger: (...args: unknown[]) => createReminderWithTriggerMock(...args),
}));

vi.mock("../../storage/task-reminders", () => ({
  createTaskReminder: (...args: unknown[]) => createTaskReminderMock(...args),
  getTaskOwnedByUser: (...args: unknown[]) => getTaskOwnedByUserMock(...args),
}));

describe("executeCreateReminderIntent", () => {
  beforeEach(() => {
    resolvePlaceAliasMock.mockReset();
    createReminderWithTriggerMock.mockReset();
    createTaskReminderMock.mockReset();
    getTaskOwnedByUserMock.mockReset();
  });

  it("returns clarification when place alias is missing", async () => {
    resolvePlaceAliasMock.mockResolvedValue(null);

    const result = await executeCreateReminderIntent("u1", {
      type: "create_reminder",
      payload: {
        kind: "location_offset",
        title: "Check oil",
        body: null,
        enabled: true,
        trigger: {
          type: "location_arrival_offset",
          placeSlug: "home",
          offsetMinutes: 5,
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("missing_place_alias");
  });

  it("creates reminder when alias resolves", async () => {
    resolvePlaceAliasMock.mockResolvedValue({ id: "p1", slug: "home" });
    createReminderWithTriggerMock.mockResolvedValue({
      reminder: { id: "r1", title: "Check oil" },
      trigger: { id: "t1" },
    });

    const result = await executeCreateReminderIntent("u1", {
      type: "create_reminder",
      payload: {
        kind: "location_offset",
        title: "Check oil",
        body: null,
        enabled: true,
        trigger: {
          type: "location_arrival_offset",
          placeSlug: "home",
          offsetMinutes: 5,
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persistence).toBe("ops");
    expect(result.reminderId).toBe("r1");
    expect(result.triggerId).toBe("t1");
    expect(createReminderWithTriggerMock).toHaveBeenCalledTimes(1);
  });

  it("creates datetime reminder in task_reminders lane", async () => {
    createTaskReminderMock.mockResolvedValue({
      id: "tr1",
      activity: "Pay rent",
    });

    const result = await executeCreateReminderIntent("u1", {
      type: "create_reminder",
      payload: {
        kind: "time",
        title: "Pay rent",
        body: null,
        enabled: true,
        trigger: {
          type: "datetime",
          atIso: "2030-01-01T09:00:00.000Z",
        },
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.persistence).toBe("task_reminder");
    expect(result.taskReminderId).toBe("tr1");
    expect(createTaskReminderMock).toHaveBeenCalledTimes(1);
    expect(createReminderWithTriggerMock).not.toHaveBeenCalled();
  });

  it("returns clarification when provided task is not owned by user", async () => {
    getTaskOwnedByUserMock.mockResolvedValue(null);

    const result = await executeCreateReminderIntent("u1", {
      type: "create_reminder",
      payload: {
        kind: "time",
        taskId: "task-x",
        title: "Do thing",
        body: null,
        enabled: true,
        trigger: {
          type: "datetime",
          atIso: "2030-01-01T09:00:00.000Z",
        },
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("task_not_found");
  });
});
