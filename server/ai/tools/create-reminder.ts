import type { AiIntentResult } from "../schemas/intent-result";
import { computeNextRunAtFromRecurrence, createReminderWithTrigger } from "../../storage/reminders";
import { resolvePlaceAlias } from "../../storage/locations";

type ReminderToolResult =
  | { ok: true; reminderId: string; triggerId: string; message: string }
  | { ok: false; clarification: string; reason: string };

export async function executeCreateReminderIntent(
  userId: string,
  intent: Extract<AiIntentResult, { type: "create_reminder" }>,
): Promise<ReminderToolResult> {
  const { payload } = intent;

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
    reminderId: created.reminder.id,
    triggerId: created.trigger.id,
    message: `Created reminder: ${created.reminder.title}`,
  };
}
