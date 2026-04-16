const SESSION_KEY = "axtask.feedbackNudge.count";
const SESSION_CAP = 8;
const DAY_KEY = "axtask.feedbackNudge.day";
const DAY_CAP = 12;
const LAST_AT_KEY = "axtask.feedbackNudge.lastAt";
const COOLDOWN_MS = 45_000;
const SOURCE_COUNTS_KEY = "axtask.feedbackNudge.sources";
const SOURCE_CAP = 3;

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

/** Fire-and-forget hook for embedding feedback prompts after meaningful actions. */
export function requestFeedbackNudge(source: string): void {
  if (typeof window === "undefined") return;
  try {
    const now = Date.now();
    const lastAt = Number(localStorage.getItem(LAST_AT_KEY) || "0") || 0;
    if (lastAt > 0 && now - lastAt < COOLDOWN_MS) return;

    const sourceKey = source.trim().toLowerCase() || "unknown";
    const sourceCounts = safeReadJson<Record<string, number>>(
      localStorage.getItem(SOURCE_COUNTS_KEY),
      {},
    );
    const sourceSeen = Number(sourceCounts[sourceKey] || 0);
    if (sourceSeen >= SOURCE_CAP) return;

    const day = isoDayNow();
    const storedDay = localStorage.getItem(DAY_KEY);
    const dayCount = Number(localStorage.getItem("axtask.feedbackNudge.dayCount") || "0") || 0;
    const nextDayCount = storedDay === day ? dayCount + 1 : 1;
    if (nextDayCount > DAY_CAP) return;

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
