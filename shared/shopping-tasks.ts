/** Shopping list voice + filter helpers (shared by client and server tests). */

export const SHOPPING_LIST_MAX_ITEMS = 15;

export function stripAvatarDelegationPhrase(raw: string): { text: string; delegation: boolean } {
  let s = raw.trim();
  let delegation = false;
  const patterns = [
    /^(?:(?:get|ask|tell)\s+(?:the\s+)?(?:avatars?|avatar|assistants?|assistant)\s+to\s+)/i,
    /^(?:(?:get|ask|tell)\s+ax\s*task\s+to\s+)/i,
    /^(?:have\s+(?:the\s+)?(?:avatars?|avatar|assistant)\s+)/i,
  ];
  for (const p of patterns) {
    if (p.test(s)) {
      s = s.replace(p, "").trim();
      delegation = true;
      break;
    }
  }
  return { text: s, delegation };
}

export function isShoppingTask(task: {
  classification: string;
  activity: string;
  notes?: string | null;
}): boolean {
  if (task.classification === "Shopping") return true;
  const combined = `${task.activity} ${task.notes || ""}`.toLowerCase();
  return /\b(buy|pick up|grocery|groceries|supermarket|shopping\s+list|market|store run|errand)\b/.test(
    combined,
  );
}

/** True when voice NLU should treat the utterance as shopping-list task creation. */
export function isShoppingVoiceUtterance(lower: string): boolean {
  if (/\b(shopping|grocery)\s+list\b/.test(lower)) return true;
  if (/\b(?:buy|get|pick up)\b/.test(lower) && /[,;]|\band\b/.test(lower)) return true;
  return false;
}

/**
 * Parse purchasable line items from a shopping-list voice phrase.
 * Expects delegation/wake words already stripped.
 */
/** Remove trailing "… to/on/for … shopping list" from a single activity string. */
export function stripTrailingShoppingListFromActivity(activity: string): string {
  return activity.replace(/\s*(?:to|on|for)\s+(?:my|the|a)?\s*(?:shopping|grocery)\s+list\.?$/i, "").trim();
}

export function extractShoppingListItemsForVoice(transcript: string): string[] {
  let s = transcript.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*(?:to|on|for)\s+(?:my|the|a)?\s*(?:shopping|grocery)\s+list\.?$/i, "").trim();
  s = s.replace(/^(?:remind me to|i need to|don't forget to|please)\s+/i, "");
  s = s.replace(/\b(?:create|add|new|make)\s+(?:a\s+)?(?:new\s+)?task\s*/gi, "");
  s = s.replace(/^(?:add|buy|get|pick up)\s+/i, "");
  const parts = s
    .split(/\s*,\s*|\s*;\s*|\s+and\s+/i)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return parts
    .map((p) => p.replace(/^the\s+/i, "").replace(/^and\s+/i, "").trim())
    .filter((p) => p.length > 0 && p.length <= 500)
    .slice(0, SHOPPING_LIST_MAX_ITEMS);
}
