/**
 * Source-of-truth map from a feedback-nudge `source` string to one of the five
 * AxTask companion avatars. Kept intentionally data-driven so the product team
 * can re-tune which companion "asks" about each action in a single file.
 *
 * See docs/FEEDBACK_AVATAR_NUDGES.md for the product rationale.
 */

export const FEEDBACK_AVATAR_KEYS = [
  "archetype",
  "productivity",
  "mood",
  "social",
  "lazy",
] as const;

export type FeedbackAvatarKey = (typeof FEEDBACK_AVATAR_KEYS)[number];

export const DEFAULT_FEEDBACK_AVATAR: FeedbackAvatarKey = "archetype";

/**
 * Explicit per-source assignments. Add a row when introducing a new
 * `requestFeedbackNudge(source)` call site; the contract test will fail if a
 * new production source is added without a mapping.
 */
export const DEFAULT_FEEDBACK_SOURCE_TO_AVATAR: Readonly<
  Record<string, FeedbackAvatarKey>
> = Object.freeze({
  // Archon — analytical, pattern-seeking
  classification_confirm: "archetype",
  classification_thumbs_up: "archetype",
  classification_reclassify: "archetype",

  // Cadence — action-oriented, momentum
  task_create: "productivity",
  task_complete: "productivity",
  task_search_success: "productivity",

  // Moodweaver — warmth, reward, reflection
  coin_claim_success: "mood",
  reward_redeem: "mood",
  feedback_submitted: "mood",

  // Nexus — community, collaboration
  bulk_actions: "social",
  community_post: "social",
  community_reply: "social",

  // Drift — recalibration, rest, low-urgency visits
  recalculate: "lazy",
  recalculate_rating: "lazy",
  dashboard_visit: "lazy",
});

/**
 * Known source strings that actually appear in the product today. Update this
 * list when adding a new `requestFeedbackNudge(...)` call site. The contract
 * test (shared/feedback-avatar-map.test.ts) asserts that every entry here has
 * an explicit mapping in DEFAULT_FEEDBACK_SOURCE_TO_AVATAR so new sources
 * cannot silently fall back to the default avatar.
 */
export const KNOWN_FEEDBACK_SOURCES = Object.freeze([
  "classification_confirm",
  "classification_thumbs_up",
  "classification_reclassify",
  "task_create",
  "task_complete",
  "task_search_success",
  "coin_claim_success",
  "reward_redeem",
  "feedback_submitted",
  "bulk_actions",
  "community_post",
  "community_reply",
  "recalculate",
  "recalculate_rating",
  "dashboard_visit",
]);

/**
 * Resolve the avatar for a given nudge source. Unknown sources fall back to
 * DEFAULT_FEEDBACK_AVATAR so the feedback system degrades gracefully, never
 * throwing from a tracking hook.
 */
export function getAvatarForSource(source: string | null | undefined): FeedbackAvatarKey {
  if (!source) return DEFAULT_FEEDBACK_AVATAR;
  const key = source.trim().toLowerCase();
  if (!key) return DEFAULT_FEEDBACK_AVATAR;
  return DEFAULT_FEEDBACK_SOURCE_TO_AVATAR[key] ?? DEFAULT_FEEDBACK_AVATAR;
}

/** Canonical display names for each avatar. Matches dialogue-engine VOICE_MAP. */
export const FEEDBACK_AVATAR_NAMES: Readonly<Record<FeedbackAvatarKey, string>> =
  Object.freeze({
    archetype: "Archon",
    productivity: "Cadence",
    mood: "Moodweaver",
    social: "Nexus",
    lazy: "Drift",
  });

/**
 * Short persona descriptor used in settings rows so users recognize which
 * companion a slider tunes.
 */
export const FEEDBACK_AVATAR_BLURBS: Readonly<Record<FeedbackAvatarKey, string>> =
  Object.freeze({
    archetype: "Analytical. Asks about classification and framing.",
    productivity: "Action-oriented. Asks after tasks created, completed, found.",
    mood: "Reflective. Asks after rewards and emotional milestones.",
    social: "Community-minded. Asks after bulk and shared work.",
    lazy: "Calm. Asks during low-urgency moments and recalibrations.",
  });

export function isFeedbackAvatarKey(value: unknown): value is FeedbackAvatarKey {
  return typeof value === "string" && (FEEDBACK_AVATAR_KEYS as readonly string[]).includes(value);
}
