/**
 * Content Moderation Layer
 * ────────────────────────
 * Filters inappropriate language, profanity, slurs, and blocks image/media uploads
 * from all community-facing write paths.
 */

// ── Banned word list (lowercase) ──────────────────────────────────────────────
// Covers common profanity, slurs, hate speech, and sexual content.
// Uses stemmed roots so variations (plurals, -ing, -ed) are caught by substring match.
const BANNED_ROOTS: string[] = [
  // profanity
  "fuck", "shit", "damn", "bitch", "bastard", "ass", "crap",
  "dick", "cock", "cunt", "piss", "wank", "bollocks", "bugger",
  "twat", "tit", "prick", "arsehole", "asshole",
  // slurs & hate speech
  "nigger", "nigga", "faggot", "fag", "dyke", "retard", "spic",
  "chink", "gook", "kike", "tranny", "wetback", "beaner",
  "cracker", "honky", "coon", "darkie", "raghead", "towelhead",
  "slut", "whore", "hoe",
  // sexual
  "porn", "hentai", "xxx", "nsfw", "nude", "naked",
  // violence / threats
  "kill yourself", "kys",
];

// Build a regex that matches any banned root as a whole word or substring,
// including common leet-speak substitutions (0→o, 1→i, 3→e, 4→a, 5→s, @→a, $→s).
function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/[_\-.*+]/g, "")   // strip separators people use to evade filters
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Pre-compile a single combined regex for efficiency
const BANNED_PATTERN = new RegExp(
  BANNED_ROOTS.map((r) => r.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

export interface ModerationResult {
  allowed: boolean;
  reason?: string;
  /** The specific match that triggered rejection (for logging, never shown to user) */
  matchedTerm?: string;
}

/**
 * Check whether user-submitted text passes community guidelines.
 */
export function moderateText(input: string): ModerationResult {
  if (!input || input.trim().length === 0) {
    return { allowed: false, reason: "Message cannot be empty." };
  }

  const normalized = normalizeText(input);
  const match = BANNED_PATTERN.exec(normalized);

  if (match) {
    return {
      allowed: false,
      reason: "Your message contains language that isn't allowed in the community. Please rephrase and try again.",
      matchedTerm: match[0],
    };
  }

  // Check for excessive caps (shouting) — >70% uppercase in messages longer than 10 chars
  const alphaChars = input.replace(/[^a-zA-Z]/g, "");
  if (alphaChars.length > 10) {
    const upperRatio = alphaChars.replace(/[^A-Z]/g, "").length / alphaChars.length;
    if (upperRatio > 0.7) {
      return {
        allowed: false,
        reason: "Please don't use excessive capitals. Keep it friendly!",
      };
    }
  }

  // URL / link spam filter — disallow raw URLs (community is text-only)
  if (/https?:\/\/|www\./i.test(input)) {
    return {
      allowed: false,
      reason: "Links are not allowed in community posts. Share your thoughts in words!",
    };
  }

  return { allowed: true };
}

/**
 * Check for image/media content in a request body.
 * Community endpoints are text-only — reject anything that looks like a file upload.
 */
export function rejectMediaContent(contentType: string | undefined): ModerationResult {
  if (!contentType) return { allowed: true };
  const ct = contentType.toLowerCase();
  if (
    ct.includes("multipart/form-data") ||
    ct.includes("image/") ||
    ct.includes("video/") ||
    ct.includes("audio/") ||
    ct.includes("application/octet-stream")
  ) {
    return {
      allowed: false,
      reason: "The community forum is text-only. Image and media uploads are not supported.",
    };
  }
  return { allowed: true };
}

/**
 * Sanitize text for safe display — strip HTML tags and limit length.
 */
export function sanitizeForDisplay(input: string, maxLength = 2000): string {
  return input
    .replace(/<[^>]*>/g, "")          // strip HTML
    .replace(/&[a-z]+;/gi, "")         // strip HTML entities
    .slice(0, maxLength)
    .trim();
}

