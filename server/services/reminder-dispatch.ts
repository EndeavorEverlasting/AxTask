import webpush from "web-push";
import { getUserNotificationPreference, listPushDispatchCandidates, markPushSubscriptionDispatched } from "../storage";
import {
  computeNextRunAtFromRecurrence,
  finalizeReminderTriggerDispatch,
  listDueReminderDispatchRows,
} from "../storage/reminders";

export type ReminderDispatchSummary = {
  scanned: number;
  attempted: number;
  sent: number;
  skipped: number;
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

export async function dispatchDueReminderTriggers(limit = 100): Promise<ReminderDispatchSummary> {
  const now = new Date();
  const due = await listDueReminderDispatchRows(now, limit);
  if (due.length === 0) return { scanned: 0, attempted: 0, sent: 0, skipped: 0 };
  if (!configureWebPush()) return { scanned: due.length, attempted: 0, sent: 0, skipped: due.length };

  // Reuse existing notification preference + intensity pipeline.
  const candidates = await listPushDispatchCandidates(limit * 4);
  const subscriptionsByUser = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const arr = subscriptionsByUser.get(candidate.userId) || [];
    arr.push(candidate);
    subscriptionsByUser.set(candidate.userId, arr);
  }

  let attempted = 0;
  let sent = 0;
  let skipped = 0;

  for (const row of due) {
    const pref = await getUserNotificationPreference(row.reminder.userId);
    if (!pref.enabled) {
      skipped += 1;
      continue;
    }
    const queue = subscriptionsByUser.get(row.reminder.userId) || [];
    if (queue.length === 0) {
      skipped += 1;
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
      await markPushSubscriptionDispatched(candidate.subscription.endpoint);
      const nextRunAt = computeNextRunAtFromRecurrence(row.trigger.payloadJson, now);
      await finalizeReminderTriggerDispatch({
        triggerId: row.trigger.id,
        firedAt: now,
        nextRunAt,
      });
      sent += 1;
    } catch {
      skipped += 1;
    }
  }

  return {
    scanned: due.length,
    attempted,
    sent,
    skipped,
  };
}

