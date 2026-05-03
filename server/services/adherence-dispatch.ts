import webpush from "web-push";
import { isAdherenceEnabled } from "./adherence-thresholds";

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

function buildPayload(intervention: {
  id: string;
  title: string;
  message: string;
  signal: string;
}): string {
  return JSON.stringify({
    title: intervention.title,
    body: intervention.message,
    url: `/planner?adherence=${encodeURIComponent(intervention.id)}`,
    meta: {
      interventionId: intervention.id,
      signal: intervention.signal,
      type: "adherence",
    },
  });
}

export async function dispatchAdherencePushNotifications(limit = 100): Promise<{ attempted: number; sent: number }> {
  if (!isAdherenceEnabled()) return { attempted: 0, sent: 0 };
  if (!configureWebPush()) return { attempted: 0, sent: 0 };

  const {
    listDispatchableAdherenceInterventions,
    listPushDispatchCandidates,
    markAdherenceInterventionPushSent,
    markPushSubscriptionDispatched,
  } = await import("../storage");

  const [interventions, candidates] = await Promise.all([
    listDispatchableAdherenceInterventions(limit),
    listPushDispatchCandidates(limit * 2),
  ]);
  if (interventions.length === 0 || candidates.length === 0) return { attempted: 0, sent: 0 };

  const byUser = new Map<string, typeof interventions>();
  for (const i of interventions) {
    const arr = byUser.get(i.userId) || [];
    arr.push(i);
    byUser.set(i.userId, arr);
  }

  let attempted = 0;
  let sent = 0;
  for (const candidate of candidates) {
    const queue = byUser.get(candidate.userId);
    if (!queue || queue.length === 0) continue;
    const intervention = queue.shift()!;
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
      await webpush.sendNotification(subscription, buildPayload(intervention));
      await Promise.all([
        markPushSubscriptionDispatched(candidate.subscription.endpoint),
        markAdherenceInterventionPushSent(intervention.id),
      ]);
      sent += 1;
    } catch {
      // Keep processing remaining recipients.
    }
    if (attempted >= limit) break;
  }

  return { attempted, sent };
}

