import * as webPush from "web-push";
import {
  deleteUserPushSubscription,
  listPushDispatchCandidates,
  markPushSubscriptionDispatched,
  storage,
} from "../storage";
import { isWebPushVapidConfigured } from "./vapid-runtime";
import { log } from "../vite";

function pushSendErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  if (!("statusCode" in err)) return undefined;
  const code = (err as { statusCode?: unknown }).statusCode;
  return typeof code === "number" ? code : undefined;
}

export async function runWebPushDispatchTick(): Promise<{ sent: number; errors: number }> {
  if (!isWebPushVapidConfigured()) return { sent: 0, errors: 0 };

  let sent = 0;
  let errors = 0;
  const candidates = await listPushDispatchCandidates(200);

  for (const candidate of candidates) {
    const { subscription, userId } = candidate;
    let stats: { totalTasks: number; highPriorityTasks: number };
    try {
      stats = await storage.getTaskStats(userId);
    } catch {
      errors += 1;
      continue;
    }

    const bodyParts: string[] = [];
    bodyParts.push(
      `${stats.totalTasks} task${stats.totalTasks === 1 ? "" : "s"} total`,
    );
    if (stats.highPriorityTasks > 0) {
      bodyParts.push(
        `${stats.highPriorityTasks} high priority`,
      );
    }
    const body =
      stats.totalTasks === 0
        ? "No tasks yet — open AxTask to add one."
        : `${bodyParts.join(" · ")}.`;

    const payload = JSON.stringify({
      title: "AxTask",
      body,
      url: "/",
    });

    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          expirationTime: subscription.expirationTime ?? undefined,
        },
        payload,
        { TTL: 60 * 60 },
      );
      try {
        await markPushSubscriptionDispatched(subscription.endpoint);
      } catch (markErr) {
        console.error(
          "[web-push] markPushSubscriptionDispatched failed",
          subscription.endpoint,
          markErr instanceof Error ? markErr.message : markErr,
        );
      }
      sent += 1;
    } catch (err) {
      errors += 1;
      const status = pushSendErrorStatus(err);
      if (status === 404 || status === 410) {
        await deleteUserPushSubscription(userId, subscription.endpoint).catch(() => undefined);
      } else if (process.env.NODE_ENV === "development") {
        log(`web-push send failed (${status ?? "?"}): ${err instanceof Error ? err.message : String(err)}`, "web-push");
      }
    }
  }

  return { sent, errors };
}

export function startWebPushDispatchScheduler(): void {
  if ((process.env.DISABLE_PUSH_DISPATCH || "").trim().toLowerCase() === "true") {
    return;
  }

  const intervalMs = Math.max(
    60_000,
    parseInt(process.env.PUSH_DISPATCH_INTERVAL_MS || "120000", 10) || 120_000,
  );

  if (!isWebPushVapidConfigured()) {
    if (process.env.NODE_ENV === "development") {
      log(
        "Web push digest scheduler skipped (VAPID not configured — check database reachability and CANONICAL_HOST / VAPID_SUBJECT).",
        "web-push",
      );
    }
    return;
  }

  log(`Web push digest scheduler every ${intervalMs}ms`, "web-push");

  void runWebPushDispatchTick().catch(() => undefined);
  setInterval(() => {
    void runWebPushDispatchTick().catch(() => undefined);
  }, intervalMs);
}
