// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReminderDispatcher } from "./reminder-dispatch-core";

const hoisted = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("web-push", () => ({
  default: {
    sendNotification: hoisted.sendNotification,
    setVapidDetails: hoisted.setVapidDetails,
  },
}));

describe("dispatchDueReminderTriggers (createReminderDispatcher)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VITE_VAPID_PUBLIC_KEY = "pub";
  });

  it("returns empty summary when no due reminders", async () => {
    const dispatch = createReminderDispatcher({
      listDueReminderDispatchRows: vi.fn().mockResolvedValueOnce([]),
      listDueTaskReminderRows: vi.fn().mockResolvedValueOnce([]),
      getUserNotificationPreference: vi.fn(),
      listPushDispatchCandidates: vi.fn(),
      markPushSubscriptionDispatched: vi.fn(),
      computeNextRunAtFromRecurrence: vi.fn(),
      finalizeReminderTriggerDispatch: vi.fn(),
      finalizeTaskReminderDispatch: vi.fn(),
    });
    const result = await dispatch(10);
    expect(result).toEqual({
      scanned: 0,
      attempted: 0,
      sent: 0,
      skipped: 0,
      skippedPreferenceDisabled: 0,
      skippedNoSubscription: 0,
      failedSend: 0,
    });
  });

  it("dispatches due reminder and finalizes trigger", async () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const listDueReminderDispatchRows = vi.fn().mockResolvedValueOnce([
      {
        reminder: { id: "r1", userId: "u1", title: "Check oil", body: null },
        trigger: { id: "t1", payloadJson: { recurrence: { frequency: "daily", interval: 1 } } },
      },
    ]);
    const listDueTaskReminderRows = vi.fn().mockResolvedValueOnce([]);
    const listPushDispatchCandidates = vi.fn().mockResolvedValueOnce([
      {
        userId: "u1",
        subscription: {
          endpoint: "https://push.example/sub",
          expirationTime: null,
          p256dh: "k1",
          auth: "k2",
        },
      },
    ]);
    const getUserNotificationPreference = vi.fn().mockResolvedValueOnce({ enabled: true });
    const computeNextRunAtFromRecurrence = vi
      .fn()
      .mockReturnValueOnce(new Date("2030-01-02T00:00:00.000Z"));
    const finalizeReminderTriggerDispatch = vi.fn().mockResolvedValueOnce(undefined);
    const markPushSubscriptionDispatched = vi.fn().mockResolvedValueOnce(undefined);

    const dispatch = createReminderDispatcher({
      listDueReminderDispatchRows,
      listDueTaskReminderRows,
      getUserNotificationPreference,
      listPushDispatchCandidates,
      markPushSubscriptionDispatched,
      computeNextRunAtFromRecurrence,
      finalizeReminderTriggerDispatch,
      finalizeTaskReminderDispatch: vi.fn(),
    });

    hoisted.sendNotification.mockResolvedValueOnce(undefined);

    const result = await dispatch(10);

    expect(hoisted.sendNotification).toHaveBeenCalledTimes(1);
    expect(markPushSubscriptionDispatched).toHaveBeenCalledWith("https://push.example/sub");
    expect(finalizeReminderTriggerDispatch).toHaveBeenCalledWith({
      triggerId: "t1",
      firedAt: now,
      nextRunAt: new Date("2030-01-02T00:00:00.000Z"),
    });
    expect(result).toEqual({
      scanned: 1,
      attempted: 1,
      sent: 1,
      skipped: 0,
      skippedPreferenceDisabled: 0,
      skippedNoSubscription: 0,
      failedSend: 0,
    });
    vi.useRealTimers();
  });

  it("dispatches due task reminder and finalizes task row", async () => {
    const now = new Date("2030-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const listDueReminderDispatchRows = vi.fn().mockResolvedValueOnce([]);
    const listDueTaskReminderRows = vi.fn().mockResolvedValueOnce([
      {
        id: "tr1",
        userId: "u1",
        taskId: "task1",
        activity: "Pay rent",
        remindAt: now,
        recurrenceRule: null,
        deliveryChannel: "auto",
        status: "pending",
      },
    ]);
    const listPushDispatchCandidates = vi.fn().mockResolvedValueOnce([
      {
        userId: "u1",
        subscription: {
          endpoint: "https://push.example/sub2",
          expirationTime: null,
          p256dh: "k1",
          auth: "k2",
        },
      },
    ]);
    const getUserNotificationPreference = vi.fn().mockResolvedValueOnce({ enabled: true });
    const finalizeTaskReminderDispatch = vi.fn().mockResolvedValueOnce(undefined);
    const markPushSubscriptionDispatched = vi.fn().mockResolvedValueOnce(undefined);

    const dispatch = createReminderDispatcher({
      listDueReminderDispatchRows,
      listDueTaskReminderRows,
      getUserNotificationPreference,
      listPushDispatchCandidates,
      markPushSubscriptionDispatched,
      computeNextRunAtFromRecurrence: vi.fn(),
      finalizeReminderTriggerDispatch: vi.fn(),
      finalizeTaskReminderDispatch,
    });

    hoisted.sendNotification.mockResolvedValueOnce(undefined);

    const result = await dispatch(10);

    expect(finalizeTaskReminderDispatch).toHaveBeenCalledWith({
      taskReminderId: "tr1",
      firedAt: now,
      nextRemindAt: null,
    });
    expect(result).toEqual({
      scanned: 1,
      attempted: 1,
      sent: 1,
      skipped: 0,
      skippedPreferenceDisabled: 0,
      skippedNoSubscription: 0,
      failedSend: 0,
    });
    vi.useRealTimers();
  });
});
