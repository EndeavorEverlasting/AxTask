import { describe, expect, it } from "vitest";
import { dispatchVoiceCommand } from "./dispatcher";
import type { Task } from "@shared/schema";

const emptyTasks: Task[] = [];
const userId = "test-user";
const taskFixtures: Task[] = [
  {
    id: "task-1",
    userId: userId,
    activity: "Doctor appointment",
    date: "2026-04-17",
    time: "10:00",
    status: "pending",
    notes: "",
    recurrence: "none",
    createdAt: new Date("2026-04-16T08:00:00Z"),
    updatedAt: new Date("2026-04-16T08:00:00Z"),
    visibility: "private",
    communityShowNotes: false,
    completedAt: null,
    isRecurringRoot: false,
    recurringRootId: null,
    recurrenceGroupId: null,
    recurrenceParentDate: null,
    sourceTaskId: null,
    sourceEventId: null,
    sourceMetaJson: null,
    sourceVersion: null,
    sourceUpdatedAt: null,
    sourceDeletedAt: null,
    sourceSyncStatus: null,
    locationText: null,
    locationPlaceId: null,
    geofenceRadiusMeters: null,
    geofenceLat: null,
    geofenceLng: null,
    geofenceUpdatedAt: null,
    geofenceSyncVersion: null,
    geofenceSyncStatus: null,
  } as Task,
];
const todayStr = "2026-04-16";
const now = new Date("2026-04-16T12:00:00Z");

describe("dispatchVoiceCommand", () => {
  it("navigates to shopping list", async () => {
    const r = await dispatchVoiceCommand("open my shopping list", emptyTasks, userId, todayStr, now);
    expect(r.intent).toBe("navigation");
    expect(r.action).toBe("navigate");
    expect(r.payload.path).toBe("/shopping");
  });

  it("creates shopping tasks from a single item utterance", async () => {
    const r = await dispatchVoiceCommand("add milk to my shopping list", emptyTasks, userId, todayStr, now);
    expect(r.action).toBe("create_shopping_tasks");
    expect(r.payload.items).toEqual(["milk"]);
    expect(r.payload.date).toBe(todayStr);
    expect(r.message).not.toMatch(/^On it —/);
  });

  it("uses delegation tone when avatar phrasing is present", async () => {
    const r = await dispatchVoiceCommand(
      "get the avatar to add milk to my shopping list",
      emptyTasks,
      userId,
      todayStr,
      now,
    );
    expect(r.action).toBe("create_shopping_tasks");
    expect(r.message.startsWith("On it —")).toBe(true);
  });

  it("creates multiple shopping tasks", async () => {
    const r = await dispatchVoiceCommand(
      "add milk, eggs, and bread to my shopping list",
      emptyTasks,
      userId,
      todayStr,
      now,
    );
    expect(r.action).toBe("create_shopping_tasks");
    expect(r.payload.items).toEqual(["milk", "eggs", "bread"]);
  });

  it("creates alarm payload for a matched task", async () => {
    const r = await dispatchVoiceCommand(
      "set alarm for doctor appointment at 7:30 am tomorrow",
      taskFixtures,
      userId,
      todayStr,
      now,
    );
    expect(r.intent).toBe("alarm_config");
    expect(r.action).toBe("alarm_create_for_task");
    expect(r.payload.taskId).toBe("task-1");
    expect(r.payload.alarmTime).toBe("07:30");
  });

  it("lists alarm snapshots when asked", async () => {
    const r = await dispatchVoiceCommand("show my alarms", taskFixtures, userId, todayStr, now);
    expect(r.intent).toBe("alarm_config");
    expect(r.action).toBe("alarm_list");
  });

  it("matches wake me up phrasing", async () => {
    const r = await dispatchVoiceCommand(
      "wake me up for doctor appointment at 8 pm tomorrow",
      taskFixtures,
      userId,
      todayStr,
      now,
    );
    expect(r.action).toBe("alarm_create_for_task");
    expect(r.payload.alarmTime).toBe("20:00");
  });

  it("parses 24-hour clock times", async () => {
    const r = await dispatchVoiceCommand(
      "remind me at 14:30 tomorrow for doctor appointment",
      taskFixtures,
      userId,
      todayStr,
      now,
    );
    expect(r.action).toBe("alarm_create_for_task");
    expect(r.payload.alarmTime).toBe("14:30");
  });

  it("lists alarms for what alarms phrasing", async () => {
    const r = await dispatchVoiceCommand("what alarms", taskFixtures, userId, todayStr, now);
    expect(r.action).toBe("alarm_list");
  });

  it("opens alarm panel on snooze", async () => {
    const r = await dispatchVoiceCommand("snooze doctor appointment", taskFixtures, userId, todayStr, now);
    expect(r.action).toBe("alarm_open_panel");
  });
});
