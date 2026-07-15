import { getUserNotificationPreference, listPushDispatchCandidates, markPushSubscriptionDispatched } from "../storage";
import {
  computeNextRunAtFromRecurrence,
  finalizeReminderTriggerDispatch,
  listDueReminderDispatchRows,
} from "../storage/reminders";
import { finalizeTaskReminderDispatch, listDueTaskReminderRows } from "../storage/task-reminders";
import { createReminderDispatcher } from "./reminder-dispatch-core";
import type { ReminderDispatchSummary } from "./reminder-dispatch-core";
import { withMemoryTelemetry } from "../runtime-memory";

export type { ReminderDispatchDeps, ReminderDispatchPushCandidate, ReminderDispatchSummary } from "./reminder-dispatch-core";
export { createReminderDispatcher } from "./reminder-dispatch-core";

const dispatchDueReminderTriggersCore = createReminderDispatcher({
  getUserNotificationPreference,
  listPushDispatchCandidates,
  markPushSubscriptionDispatched,
  listDueReminderDispatchRows,
  computeNextRunAtFromRecurrence,
  finalizeReminderTriggerDispatch,
  listDueTaskReminderRows,
  finalizeTaskReminderDispatch,
});

export function dispatchDueReminderTriggers(
  limit = 100,
): Promise<ReminderDispatchSummary> {
  return withMemoryTelemetry(
    "reminders.dispatch",
    () => dispatchDueReminderTriggersCore(limit),
    {
      // The worker can tick every minute. Do not emit decorative memory lines
      // when no reminder work was found.
      shouldLog: (summary) => summary.scanned > 0 || summary.failedSend > 0,
      metrics: (summary) => ({
        limit,
        scanned: summary.scanned,
        attempted: summary.attempted,
        sent: summary.sent,
        skipped: summary.skipped,
        failedSend: summary.failedSend,
      }),
    },
  );
}
