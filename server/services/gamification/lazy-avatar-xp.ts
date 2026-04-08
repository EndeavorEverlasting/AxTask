/**
 * XP rules for the "lazy" avatar — mood, gratitude, prioritization, and pace (notification intensity).
 */

const GRATITUDE_RE =
  /\b(thanks|thank you|grateful|gratitude|appreciate(?:d|s|ion)?|blessed|fortunate|good enough|enough for now)\b/i;
const REST_RE = /\b(rest|breathe|pause|kick back|slow down|unwind|take a break|chill)\b/i;
const PRIORITY_RE =
  /\b(first|priority|priorit(?:y|ies|ize|ized|izing)|top of my list|stuck|overwhelm|decide|decision|which should|not sure what|help me choose)\b/i;

export function computeLazyAvatarXp(input: {
  sourceType: "task" | "feedback" | "post";
  completed: boolean;
  text: string;
  notificationIntensity: number;
}): number {
  const raw = input.text || "";
  const normalized = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const gratitude = GRATITUDE_RE.test(normalized);
  const rest = REST_RE.test(normalized);
  const priority = PRIORITY_RE.test(normalized);
  const longForm = raw.length >= 100;

  let xp = 0;
  if (input.sourceType === "task") {
    if (input.completed && (gratitude || priority)) xp = 32;
    else if (input.completed && (rest || longForm)) xp = 26;
    else if (input.completed) xp = 18;
    else if (priority || longForm) xp = 15;
  } else if (input.sourceType === "feedback") {
    if (gratitude || rest || priority) xp = 30;
    else if (longForm) xp = 20;
    else xp = 12;
  } else {
    if (gratitude || rest) xp = 24;
    else xp = 10;
  }

  const intensity = Math.max(0, Math.min(100, input.notificationIntensity));
  if (xp > 0 && intensity <= 38) {
    xp += 8;
  }

  return xp;
}
