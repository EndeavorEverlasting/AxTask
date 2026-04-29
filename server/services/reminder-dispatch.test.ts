// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchDueReminderTriggers } from "./reminder-dispatch";

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

const reminderStorageMocks = vi.hoisted(() => ({
  listDueReminderDispatchRows: vi.fn(),
  computeNextRunAtFromRecurrence: vi.fn(),
  finalizeReminderTriggerDispatch: vi.fn(),
}));

vi.mock("../storage/reminders", () => ({
  listDueReminderDispatchRows: reminderStorageMocks.listDueReminderDispatchRows,
  computeNextRunAtFromRecurrence: reminderStorageMocks.computeNextRunAtFromRecurrence,
  finalizeReminderTriggerDispatch: reminderStorageMocks.finalizeReminderTriggerDispatch,
}));

const taskReminderStorageMocks = vi.hoisted(() => ({
  listDueTaskReminderRows: vi.fn(),
  finalizeTaskReminderDispatch: vi.fn(),
}));

vi.mock("../storage/task-reminders", () => ({
  listDueTaskReminderRows: taskReminderStorageMocks.listDueTaskReminderRows,
  finalizeTaskReminderDispatch: taskReminderStorageMocks.finalizeTaskReminderDispatch,
}));

const coreStorageMocks = vi.hoisted(() => ({
  getUserNotificationPreference: vi.fn(),
  listPushDispatchCandidates: vi.fn(),
  markPushSubscriptionDispatched: vi.fn(),
}));

vi.mock("../storage", () => ({
  getUserNotificationPreference: coreStorageMocks.getUserNotificationPreference,
  listPushDispatchCandidates: coreStorageMocks.listPushDispatchCandidates,
  markPushSubscriptionDispatched: coreStorageMocks.markPushSubscriptionDispatched,
}));

describe("dispatchDueReminderTriggers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VITE_VAPID_PUBLIC_KEY = "pub";
  });

  it("returns empty summary when no due reminders", async () => {
    reminderStorageMocks.listDueReminderDispatchRows.mockResolvedValueOnce([]);
    taskReminderStorageMocks.listDueTaskReminderRows.mockResolvedValueOnce([]);
    const result = await dispatchDueReminderTriggers(10);
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
    reminderStorageMocks.listDueReminderDispatchRows.mockResolvedValueOnce([
      {
        reminder: { id: "r1", userId: "u1", title: "Check oil", body: null },
        trigger: { id: "t1", payloadJson: { recurrence: { frequency: "daily", interval: 1 } } },
      },
    ]);
    taskReminderStorageMocks.listDueTaskReminderRows.mockResolvedValueOnce([]);
    coreStorageMocks.listPushDispatchCandidates.mockResolvedValueOnce([
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
    coreStorageMocks.getUserNotificationPreference.mockResolvedValueOnce({ enabled: true });
    reminderStorageMocks.computeNextRunAtFromRecurrence.mockReturnValueOnce(new Date("2030-01-02T00:00:00.000Z"));
    hoisted.sendNotification.mockResolvedValueOnce(undefined);
    coreStorageMocks.markPushSubscriptionDispatched.mockResolvedValueOnce(undefined);
    reminderStorageMocks.finalizeReminderTriggerDispatch.mockResolvedValueOnce(undefined);

    const result = await dispatchDueReminderTriggers(10);

    expect(hoisted.sendNotification).toHaveBeenCalledTimes(1);
    expect(coreStorageMocks.markPushSubscriptionDispatched).toHaveBeenCalledWith("https://push.example/sub");
    expect(reminderStorageMocks.finalizeReminderTriggerDispatch).toHaveBeenCalledWith({
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
    reminderStorageMocks.listDueReminderDispatchRows.mockResolvedValueOnce([]);
    taskReminderStorageMocks.listDueTaskReminderRows.mockResolvedValueOnce([
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
    coreStorageMocks.listPushDispatchCandidates.mockResolvedValueOnce([
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
    coreStorageMocks.getUserNotificationPreference.mockResolvedValueOnce({ enabled: true });
    hoisted.sendNotification.mockResolvedValueOnce(undefined);
    coreStorageMocks.markPushSubscriptionDispatched.mockResolvedValueOnce(undefined);
    taskReminderStorageMocks.finalizeTaskReminderDispatch.mockResolvedValueOnce(undefined);

    const result = await dispatchDueReminderTriggers(10);

    expect(taskReminderStorageMocks.finalizeTaskReminderDispatch).toHaveBeenCalledWith({
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

