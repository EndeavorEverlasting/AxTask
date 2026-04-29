import { getUserNotificationPreference, listPushDispatchCandidates, markPushSubscriptionDispatched } from "../storage";
import {
  computeNextRunAtFromRecurrence,
  finalizeReminderTriggerDispatch,
  listDueReminderDispatchRows,
} from "../storage/reminders";
import { finalizeTaskReminderDispatch, listDueTaskReminderRows } from "../storage/task-reminders";
import { createReminderDispatcher } from "./reminder-dispatch-core";

export type { ReminderDispatchDeps, ReminderDispatchPushCandidate, ReminderDispatchSummary } from "./reminder-dispatch-core";
export { createReminderDispatcher } from "./reminder-dispatch-core";

export const dispatchDueReminderTriggers = createReminderDispatcher({
  getUserNotificationPreference,
  listPushDispatchCandidates,
  markPushSubscriptionDispatched,
  listDueReminderDispatchRows,
  computeNextRunAtFromRecurrence,
  finalizeReminderTriggerDispatch,
  listDueTaskReminderRows,
  finalizeTaskReminderDispatch,
});
