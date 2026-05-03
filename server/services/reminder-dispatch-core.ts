import webpush from "web-push";
import type { DueReminderDispatchRow } from "../storage/reminders";
import type { DueTaskReminderRow } from "../storage/task-reminders";

export type ReminderDispatchSummary = {
  scanned: number;
  attempted: number;
  sent: number;
  skipped: number;
  skippedPreferenceDisabled: number;
  skippedNoSubscription: number;
  failedSend: number;
};

/** Minimal push candidate shape used by the dispatcher (matches `PushDispatchCandidate` from storage). */
export type ReminderDispatchPushCandidate = {
  userId: string;
  subscription: {
    endpoint: string;
    expirationTime: number | null | undefined;
    p256dh: string;
    auth: string;
  };
};

export type ReminderDispatchDeps = {
  getUserNotificationPreference: (userId: string) => Promise<{ enabled: boolean }>;
  listPushDispatchCandidates: (limit: number) => Promise<ReminderDispatchPushCandidate[]>;
  markPushSubscriptionDispatched: (endpoint: string) => Promise<void>;
  listDueReminderDispatchRows: (now: Date, limit: number) => Promise<DueReminderDispatchRow[]>;
  computeNextRunAtFromRecurrence: (payloadJson: unknown, from: Date) => Date | null;
  finalizeReminderTriggerDispatch: (input: {
    triggerId: string;
    firedAt: Date;
    nextRunAt: Date | null;
  }) => Promise<unknown>;
  listDueTaskReminderRows: (now: Date, limit: number) => Promise<DueTaskReminderRow[]>;
  finalizeTaskReminderDispatch: (input: {
    taskReminderId: string;
    firedAt: Date;
    nextRemindAt: Date | null;
  }) => Promise<unknown>;
};

function configureWebPush(): boolean {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:alerts@axtask.app",
    publicKey,
    privateKey,
  );
  return true;
}

function buildReminderPayload(input: {
  reminderId: string;
  triggerId: string;
  title: string;
  body: string | null;
}): string {
  return JSON.stringify({
    title: input.title,
    body: input.body || "You asked me to remind you.",
    url: `/planner?reminder=${encodeURIComponent(input.reminderId)}`,
    meta: {
      type: "reminder",
      reminderId: input.reminderId,
      triggerId: input.triggerId,
    },
  });
}

function buildTaskReminderPayload(input: { taskReminderId: string; activity: string; taskId: string | null }): string {
  return JSON.stringify({
    title: input.activity,
    body: "You asked me to remind you.",
    url: input.taskId ? `/planner?task=${encodeURIComponent(input.taskId)}` : "/planner",
    meta: {
      type: "task_reminder",
      taskReminderId: input.taskReminderId,
      taskId: input.taskId,
    },
  });
}

function getNextRunAtFromTaskReminder(
  row: DueTaskReminderRow,
  now: Date,
  computeNextRunAtFromRecurrence: (payloadJson: unknown, from: Date) => Date | null,
): Date | null {
  if (!row.recurrenceRule) return null;
  try {
    const recurrence = JSON.parse(row.recurrenceRule) as unknown;
    return computeNextRunAtFromRecurrence({ recurrence }, now);
  } catch {
    return null;
  }
}

export function createReminderDispatcher(deps: ReminderDispatchDeps) {
  return async function dispatchDueReminderTriggers(limit = 100): Promise<ReminderDispatchSummary> {
    const now = new Date();
    const dueOps = await deps.listDueReminderDispatchRows(now, limit);
    const dueTaskReminders = await deps.listDueTaskReminderRows(now, limit);
    const scanned = dueOps.length + dueTaskReminders.length;
    if (scanned === 0) {
      return {
        scanned: 0,
        attempted: 0,
        sent: 0,
        skipped: 0,
        skippedPreferenceDisabled: 0,
        skippedNoSubscription: 0,
        failedSend: 0,
      };
    }
    if (!configureWebPush()) {
      return {
        scanned,
        attempted: 0,
        sent: 0,
        skipped: scanned,
        skippedPreferenceDisabled: 0,
        skippedNoSubscription: scanned,
        failedSend: 0,
      };
    }

    const candidates = await deps.listPushDispatchCandidates(limit * 4);
    const subscriptionsByUser = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      const arr = subscriptionsByUser.get(candidate.userId) || [];
      arr.push(candidate);
      subscriptionsByUser.set(candidate.userId, arr);
    }

    let attempted = 0;
    let sent = 0;
    let skipped = 0;
    let skippedPreferenceDisabled = 0;
    let skippedNoSubscription = 0;
    let failedSend = 0;

    for (const row of dueOps) {
      const pref = await deps.getUserNotificationPreference(row.reminder.userId);
      if (!pref.enabled) {
        skipped += 1;
        skippedPreferenceDisabled += 1;
        continue;
      }
      const queue = subscriptionsByUser.get(row.reminder.userId) || [];
      if (queue.length === 0) {
        skipped += 1;
        skippedNoSubscription += 1;
        continue;
      }

      const candidate = queue.shift()!;
      attempted += 1;
      const subscription = {
        endpoint: candidate.subscription.endpoint,
        expirationTime: candidate.subscription.expirationTime ?? undefined,
        keys: {
          p256dh: candidate.subscription.p256dh,
          auth: candidate.subscription.auth,
        },
      };

      try {
        await webpush.sendNotification(
          subscription,
          buildReminderPayload({
            reminderId: row.reminder.id,
            triggerId: row.trigger.id,
            title: row.reminder.title,
            body: row.reminder.body ?? null,
          }),
        );
        await deps.markPushSubscriptionDispatched(candidate.subscription.endpoint);
        const nextRunAt = deps.computeNextRunAtFromRecurrence(row.trigger.payloadJson, now);
        await deps.finalizeReminderTriggerDispatch({
          triggerId: row.trigger.id,
          firedAt: now,
          nextRunAt,
        });
        sent += 1;
      } catch {
        skipped += 1;
        failedSend += 1;
      }
    }

    for (const row of dueTaskReminders) {
      const pref = await deps.getUserNotificationPreference(row.userId);
      if (!pref.enabled) {
        skipped += 1;
        skippedPreferenceDisabled += 1;
        continue;
      }
      const queue = subscriptionsByUser.get(row.userId) || [];
      if (queue.length === 0) {
        skipped += 1;
        skippedNoSubscription += 1;
        continue;
      }

      const candidate = queue.shift()!;
      attempted += 1;
      const subscription = {
        endpoint: candidate.subscription.endpoint,
        expirationTime: candidate.subscription.expirationTime ?? undefined,
        keys: {
          p256dh: candidate.subscription.p256dh,
          auth: candidate.subscription.auth,
        },
      };

      try {
        await webpush.sendNotification(
          subscription,
          buildTaskReminderPayload({
            taskReminderId: row.id,
            activity: row.activity,
            taskId: row.taskId ?? null,
          }),
        );
        await deps.markPushSubscriptionDispatched(candidate.subscription.endpoint);
        await deps.finalizeTaskReminderDispatch({
          taskReminderId: row.id,
          firedAt: now,
          nextRemindAt: getNextRunAtFromTaskReminder(row, now, deps.computeNextRunAtFromRecurrence),
        });
        sent += 1;
      } catch {
        skipped += 1;
        failedSend += 1;
      }
    }

    return {
      scanned,
      attempted,
      sent,
      skipped,
      skippedPreferenceDisabled,
      skippedNoSubscription,
      failedSend,
    };
  };
}
