/** Copy pool for the mobile checklist widget — paired with `wrapTextToLines` for Pretext layout. */
export const CHECKLIST_COMPLETION_QUIPS = [
  "Pretext measured that win — every glyph knows you showed up.",
  "The checklist flinched. You finished the line. Immersion holds the score.",
  "That box checked itself emotionally; you did the real work.",
  "Canvas quiet, task loud: you closed the loop. Pretext approves.",
  "One more line conquered — the fold remembers who cleared it.",
  "Momentum, typed and wrapped: you earned this strikethrough energy.",
  "Small checkbox, big arc — you advanced the story today.",
] as const;

/** Deterministic FNV-1a-ish mix for stable quip selection per task id. */
export function hashStringToUint32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pickCelebrationQuip(
  taskId: string,
  quips: readonly string[] = CHECKLIST_COMPLETION_QUIPS,
): string {
  if (quips.length === 0) return "";
  const idx = hashStringToUint32(taskId) % quips.length;
  return quips[idx] ?? quips[0];
}

/** Full narration string before Pretext line-breaking (immersive cue body). */
export function buildCelebrationNarration(activityLabel: string, quip: string): string {
  const label = activityLabel.trim() || "That item";
  const q = quip.trim();
  return q.length ? `${label} — done. ${q}` : `${label} — done.`;
}
