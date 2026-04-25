// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeCreateReminderIntent } from "./create-reminder";

const resolvePlaceAliasMock = vi.fn();
const createReminderWithTriggerMock = vi.fn();

vi.mock("../../storage/locations", () => ({
  resolvePlaceAlias: (...args: unknown[]) => resolvePlaceAliasMock(...args),
}));

vi.mock("../../storage/reminders", () => ({
  createReminderWithTrigger: (...args: unknown[]) => createReminderWithTriggerMock(...args),
}));

describe("executeCreateReminderIntent", () => {
  beforeEach(() => {
    resolvePlaceAliasMock.mockReset();
    createReminderWithTriggerMock.mockReset();
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
    expect(result.reminderId).toBe("r1");
    expect(result.triggerId).toBe("t1");
    expect(createReminderWithTriggerMock).toHaveBeenCalledTimes(1);
  });
});
