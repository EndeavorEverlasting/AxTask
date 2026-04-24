/** Shopping list voice + filter helpers (shared by client and server tests). */

export const SHOPPING_LIST_MAX_ITEMS = 15;

export type ShoppingListFormat =
  | "markdown_checklist"
  | "bullet_lines"
  | "numbered_lines"
  | "title_plus_lines"
  | "comma_or_and"
  | "none";

export type ShoppingListDetectionSource = "local_parser" | "nodeweaver_rag" | "none";

export interface ShoppingListDetection {
  detected: boolean;
  format: ShoppingListFormat;
  items: string[];
  confidence: number;
  source: ShoppingListDetectionSource;
  hasShoppingCue: boolean;
}

const EMPTY_SHOPPING_DETECTION: ShoppingListDetection = {
  detected: false,
  format: "none",
  items: [],
  confidence: 0,
  source: "none",
  hasShoppingCue: false,
};

const SHOPPING_CUE_RE =
  /\b(shopping\s+list|grocery|groceries|buy|pick up|supermarket|market|store run|shop for|pantry)\b/i;

const TITLE_CUE_RE = /^\s*(?:my\s+)?(?:shopping|grocery)\s+list\s*:?\s*$/i;

const GROCERY_ITEM_HINTS = new Set(
  [
    "milk",
    "bread",
    "eggs",
    "cheese",
    "butter",
    "yogurt",
    "apples",
    "bananas",
    "tomatoes",
    "onions",
    "potatoes",
    "rice",
    "beans",
    "pasta",
    "chicken",
    "beef",
    "soap",
    "toilet paper",
    "paper towels",
    "coffee",
    "tea",
  ].map((v) => v.toLowerCase()),
);

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
  return /\b(buy|pick up|grocery|groceries|supermarket|shopping\s+list|market|store run|shop for|pantry)\b/.test(
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

/** Phrases where "X and Y" names one item (do not split). */
const COMPOUND_AND_PHRASES = new Set(
  [
    "mac and cheese",
    "bread and butter",
    "oil and vinegar",
    "salt and pepper",
    "peanut butter and jelly",
    "rice and beans",
    "fish and chips",
    "ham and cheese",
  ].map((s) => s.toLowerCase()),
);

/** Split "a and b" into two items only when it looks like a short pair list, not a compound product name. */
function splitSegmentOnAndForShopping(segment: string): string[] {
  const t = segment.trim();
  if (!t) return [];
  if (COMPOUND_AND_PHRASES.has(t.toLowerCase())) return [t];
  const m = /^\s*(\w+(?:[-']\w+)?)\s+and\s+(\w+(?:[-']\w+)?)\s*$/i.exec(t);
  if (!m) return [t];
  return [m[1], m[2]];
}

function normalizeShoppingItem(raw: string): string {
  return raw
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/^\s*\[[ xX]\]\s*/, "")
    .replace(/^\s*(?:\d{1,3}[.)])\s*/, "")
    .replace(/^\s*(?:buy|get|pick up)\s+/i, "")
    .replace(/^\s*(?:and|the)\s+/i, "")
    .replace(/\s*(?:,|;|\.|!)+\s*$/, "")
    .trim();
}

function dedupeItems(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = normalizeShoppingItem(raw);
    if (!item || item.length > 500) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= SHOPPING_LIST_MAX_ITEMS) break;
  }
  return out;
}

function splitCommaAndList(input: string): string[] {
  const coarse = input.split(/\s*,\s*|\s*;\s*/);
  const out: string[] = [];
  for (const seg of coarse) {
    const trimmed = seg.trim();
    if (!trimmed) continue;
    out.push(...splitSegmentOnAndForShopping(trimmed));
  }
  return out;
}

function hasShoppingCue(text: string): boolean {
  return SHOPPING_CUE_RE.test(text);
}

function looksLikeGroceryItems(items: string[]): boolean {
  let hints = 0;
  for (const raw of items) {
    const item = raw.toLowerCase();
    if (GROCERY_ITEM_HINTS.has(item)) hints += 1;
    if (hints >= 2) return true;
  }
  return false;
}

function detectMarkdownChecklist(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const items: string[] = [];
  for (const line of lines) {
    const m = /^\s*[-*]\s*\[(?: |x|X)\]\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    items.push(m[1]);
  }
  return dedupeItems(items);
}

function detectPlainBullets(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const items: string[] = [];
  for (const line of lines) {
    if (/^\s*[-*]\s*\[(?: |x|X)\]\s+/.test(line)) continue;
    const m = /^\s*[-*•]\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    items.push(m[1]);
  }
  return dedupeItems(items);
}

function detectNumberedLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const items: string[] = [];
  for (const line of lines) {
    const m = /^\s*\d{1,3}[.)]\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    items.push(m[1]);
  }
  return dedupeItems(items);
}

function detectTitlePlusLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (!TITLE_CUE_RE.test(lines[i])) continue;
    const items: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j].trim();
      if (!line) {
        if (items.length > 0) break;
        continue;
      }
      const markdown = /^\s*[-*]\s*\[(?: |x|X)\]\s+(.+?)\s*$/.exec(lines[j]);
      if (markdown) {
        items.push(markdown[1]);
        continue;
      }
      const bullet = /^\s*[-*•]\s+(.+?)\s*$/.exec(lines[j]);
      if (bullet) {
        items.push(bullet[1]);
        continue;
      }
      const numbered = /^\s*\d{1,3}[.)]\s+(.+?)\s*$/.exec(lines[j]);
      if (numbered) {
        items.push(numbered[1]);
        continue;
      }
      if (/^[A-Za-z0-9][A-Za-z0-9\s'/-]{1,120}$/.test(line)) {
        items.push(line);
        continue;
      }
      if (items.length > 0) break;
    }
    const normalized = dedupeItems(items);
    if (normalized.length > 0) return normalized;
  }
  return [];
}

function detectCommaAndList(activity: string, notes: string): string[] {
  const activityItems = dedupeItems(splitCommaAndList(activity));
  if (activityItems.length >= 2) return activityItems;
  const firstNotesLine = notes.split(/\r?\n/).map((x) => x.trim()).find(Boolean) || "";
  if (!firstNotesLine) return [];
  return dedupeItems(splitCommaAndList(firstNotesLine));
}

export function detectShoppingListContent(activity: string, notes = ""): ShoppingListDetection {
  const a = activity.trim();
  const n = notes.trim();
  const combined = `${a}\n${n}`.trim();
  if (!combined) return { ...EMPTY_SHOPPING_DETECTION };
  const cue = hasShoppingCue(combined);

  const markdownItems = detectMarkdownChecklist(combined);
  if (markdownItems.length >= 2 && (cue || markdownItems.length >= 3)) {
    return {
      detected: true,
      format: "markdown_checklist",
      items: markdownItems,
      confidence: cue ? 0.88 : 0.74,
      source: "local_parser",
      hasShoppingCue: cue,
    };
  }

  const titleItems = detectTitlePlusLines(combined);
  if (titleItems.length > 0) {
    return {
      detected: true,
      format: "title_plus_lines",
      items: titleItems,
      confidence: 0.93,
      source: "local_parser",
      hasShoppingCue: true,
    };
  }

  const bulletItems = detectPlainBullets(combined);
  if (bulletItems.length >= 2 && (cue || bulletItems.length >= 3)) {
    return {
      detected: true,
      format: "bullet_lines",
      items: bulletItems,
      confidence: cue ? 0.84 : 0.71,
      source: "local_parser",
      hasShoppingCue: cue,
    };
  }

  const numberedItems = detectNumberedLines(combined);
  if (numberedItems.length >= 2 && (cue || numberedItems.length >= 3)) {
    return {
      detected: true,
      format: "numbered_lines",
      items: numberedItems,
      confidence: cue ? 0.83 : 0.7,
      source: "local_parser",
      hasShoppingCue: cue,
    };
  }

  const commaItems = detectCommaAndList(a, n);
  if (
    commaItems.length >= 2 &&
    (cue || looksLikeGroceryItems(commaItems))
  ) {
    return {
      detected: true,
      format: "comma_or_and",
      items: commaItems,
      confidence: cue ? 0.79 : 0.68,
      source: "local_parser",
      hasShoppingCue: cue,
    };
  }

  return { ...EMPTY_SHOPPING_DETECTION, hasShoppingCue: cue };
}

export function withNodeWeaverShoppingDetection(
  base: ShoppingListDetection,
  input: {
    category?: string | null;
    confidence?: number | null;
    suggestedItems?: string[] | null;
  },
): ShoppingListDetection {
  if (base.detected && base.confidence >= 0.7) return base;
  const category = (input.category || "").toLowerCase();
  const confidence = typeof input.confidence === "number" ? Math.max(0, Math.min(1, input.confidence)) : 0.55;
  const categorySuggestsShopping =
    /\b(shopping|grocery|grocer|retail|errand|checklist|list)\b/.test(category);
  if (!categorySuggestsShopping && confidence < 0.75) return base;
  const parsedSuggested = dedupeItems(input.suggestedItems || []);
  return {
    detected: true,
    format: base.format === "none" ? "comma_or_and" : base.format,
    items: base.items.length > 0 ? base.items : parsedSuggested,
    confidence: Math.max(base.confidence, Math.max(0.62, confidence)),
    source: "nodeweaver_rag",
    hasShoppingCue: base.hasShoppingCue || categorySuggestsShopping,
  };
}

export function extractShoppingListItemsForVoice(transcript: string): string[] {
  let s = transcript.replace(/\s+/g, " ").trim();
  s = s.replace(/\s*(?:to|on|for)\s+(?:my|the|a)?\s*(?:shopping|grocery)\s+list\.?$/i, "").trim();
  s = s.replace(/^(?:remind me to|i need to|don't forget to|please)\s+/i, "");
  s = s.replace(/\b(?:create|add|new|make)\s+(?:a\s+)?(?:new\s+)?task\s*/gi, "");
  s = s.replace(/^(?:add|buy|get|pick up)\s+/i, "");
  return dedupeItems(splitCommaAndList(s).map((p) => p.replace(/^the\s+/i, "")));
}
