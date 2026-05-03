import type { AiIntentResult } from "../schemas/intent-result";
import { computeNextRunAtFromRecurrence, createReminderWithTrigger } from "../../storage/reminders";
import { resolvePlaceAlias } from "../../storage/locations";
import { createTaskReminder, getTaskOwnedByUser } from "../../storage/task-reminders";

type ReminderToolResult =
  | { ok: true; persistence: "ops"; reminderId: string; triggerId: string; message: string }
  | { ok: true; persistence: "task_reminder"; taskReminderId: string; message: string }
  | { ok: false; clarification: string; reason: string };

export async function executeCreateReminderIntent(
  userId: string,
  intent: Extract<AiIntentResult, { type: "create_reminder" }>,
): Promise<ReminderToolResult> {
  const { payload } = intent;
  const isTaskReminderLane = payload.trigger.type === "datetime" || payload.trigger.type === "recurring_time";

  if (isTaskReminderLane) {
    if (payload.taskId) {
      const ownedTask = await getTaskOwnedByUser(payload.taskId, userId);
      if (!ownedTask) {
        return {
          ok: false,
          clarification: "I could not find that task in your workspace. Try selecting the task again.",
          reason: "task_not_found",
        };
      }
    }

    const remindAt =
      payload.trigger.type === "datetime"
        ? new Date(payload.trigger.atIso)
        : computeNextRunAtFromRecurrence(payload.trigger, new Date());
    if (!remindAt) {
      return {
        ok: false,
        clarification: "I could not determine a valid next reminder time from that recurrence.",
        reason: "invalid_recurrence",
      };
    }

    const createdTaskReminder = await createTaskReminder({
      userId,
      taskId: payload.taskId ?? null,
      activity: payload.title,
      remindAt,
      recurrenceRule:
        payload.trigger.type === "recurring_time" ? JSON.stringify(payload.trigger.recurrence) : null,
      deliveryChannel: "auto",
    });

    return {
      ok: true,
      persistence: "task_reminder",
      taskReminderId: createdTaskReminder.id,
      message: `Created reminder: ${createdTaskReminder.activity}`,
    };
  }

  if (
    payload.trigger.type === "location_arrival_offset" ||
    payload.trigger.type === "location_arrival" ||
    payload.trigger.type === "location_departure"
  ) {
    const place = await resolvePlaceAlias(userId, payload.trigger.placeSlug);
    if (!place) {
      return {
        ok: false,
        clarification: `I could not find "${payload.trigger.placeSlug}" yet. Please add that place in Settings first.`,
        reason: "missing_place_alias",
      };
    }
  }

  const trigger =
    payload.trigger.type === "datetime"
      ? {
          triggerType: "datetime",
          payloadJson: payload.trigger,
          nextRunAt: new Date(payload.trigger.atIso),
          cooldownSeconds: 0,
          isActive: true,
        }
      : {
          triggerType: payload.trigger.type,
          payloadJson: payload.trigger,
          nextRunAt:
            payload.trigger.type === "recurring_time"
              ? computeNextRunAtFromRecurrence(payload.trigger, new Date())
              : null,
          cooldownSeconds: 0,
          isActive: true,
        };

  const created = await createReminderWithTrigger({
    reminder: {
      userId,
      kind: payload.kind,
      title: payload.title,
      body: payload.body ?? null,
      enabled: payload.enabled ?? true,
      createdBy: "ai",
    },
    trigger,
  });

  return {
    ok: true,
    persistence: "ops",
    reminderId: created.reminder.id,
    triggerId: created.trigger.id,
    message: `Created reminder: ${created.reminder.title}`,
  };
}
