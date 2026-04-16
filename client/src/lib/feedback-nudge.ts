const SESSION_KEY = "axtask.feedbackNudge.count";
const SESSION_CAP = 6;

/** Fire-and-forget hook for embedding feedback prompts after meaningful actions. */
export function requestFeedbackNudge(source: string): void {
  if (typeof window === "undefined") return;
  try {
    const n = Number(sessionStorage.getItem(SESSION_KEY) || "0") || 0;
    if (n >= SESSION_CAP) return;
    sessionStorage.setItem(SESSION_KEY, String(n + 1));
    window.dispatchEvent(new CustomEvent("axtask-feedback-nudge", { detail: { source } }));
  } catch {
    /* ignore quota / privacy mode */
  }
}
