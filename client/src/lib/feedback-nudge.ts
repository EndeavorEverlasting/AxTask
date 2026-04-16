const SESSION_KEY = "axtask.feedbackNudge.count";
const SESSION_CAP = 10;
const DAY_KEY = "axtask.feedbackNudge.day";
const DAY_CAP = 14;
const LAST_AT_KEY = "axtask.feedbackNudge.lastAt";
const SOURCE_COUNTS_KEY = "axtask.feedbackNudge.sources";
const NOTIFICATION_INTENSITY_KEY = "axtask.notification.intensity";
const NOTIFICATION_ENABLED_KEY = "axtask.notification.enabled";
const FALLBACK_COOLDOWN_MS = 90_000;
const FALLBACK_SOURCE_CAP = 2;

type FeedbackNudgePolicy = {
  cooldownMs: number;
  sourceCap: number;
  dayCap: number;
};

function safeReadJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isoDayNow(): string {
  return new Date().toISOString().slice(0, 10);
}

function getFeedbackNudgePolicy(): FeedbackNudgePolicy {
  const enabled = localStorage.getItem(NOTIFICATION_ENABLED_KEY) === "true";
  const intensity = Number(localStorage.getItem(NOTIFICATION_INTENSITY_KEY) || "50") || 50;
  if (!enabled) {
    return { cooldownMs: FALLBACK_COOLDOWN_MS, sourceCap: FALLBACK_SOURCE_CAP, dayCap: 6 };
  }
  if (intensity <= 30) {
    return { cooldownMs: 180_000, sourceCap: 2, dayCap: 5 };
  }
  if (intensity <= 70) {
    return { cooldownMs: 90_000, sourceCap: 3, dayCap: 8 };
  }
  return { cooldownMs: 45_000, sourceCap: 5, dayCap: DAY_CAP };
}

/** Fire-and-forget hook for embedding feedback prompts after meaningful actions. */
export function requestFeedbackNudge(source: string): void {
  if (typeof window === "undefined") return;
  try {
    const policy = getFeedbackNudgePolicy();
    const now = Date.now();
    const lastAt = Number(localStorage.getItem(LAST_AT_KEY) || "0") || 0;
    if (lastAt > 0 && now - lastAt < policy.cooldownMs) return;

    const sourceKey = source.trim().toLowerCase() || "unknown";
    const sourceCounts = safeReadJson<Record<string, number>>(
      localStorage.getItem(SOURCE_COUNTS_KEY),
      {},
    );
    const sourceSeen = Number(sourceCounts[sourceKey] || 0);
    if (sourceSeen >= policy.sourceCap) return;

    const day = isoDayNow();
    const storedDay = localStorage.getItem(DAY_KEY);
    const dayCount = Number(localStorage.getItem("axtask.feedbackNudge.dayCount") || "0") || 0;
    const nextDayCount = storedDay === day ? dayCount + 1 : 1;
    if (nextDayCount > policy.dayCap) return;

    const n = Number(sessionStorage.getItem(SESSION_KEY) || "0") || 0;
    if (n >= SESSION_CAP) return;

    sessionStorage.setItem(SESSION_KEY, String(n + 1));
    localStorage.setItem(DAY_KEY, day);
    localStorage.setItem("axtask.feedbackNudge.dayCount", String(nextDayCount));
    localStorage.setItem(LAST_AT_KEY, String(now));
    sourceCounts[sourceKey] = sourceSeen + 1;
    localStorage.setItem(SOURCE_COUNTS_KEY, JSON.stringify(sourceCounts));
    window.dispatchEvent(new CustomEvent("axtask-feedback-nudge", { detail: { source } }));
  } catch {
    /* ignore quota / privacy mode */
  }
}
