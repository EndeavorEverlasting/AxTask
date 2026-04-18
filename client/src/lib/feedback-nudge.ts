import {
  DEFAULT_FEEDBACK_AVATAR,
  FEEDBACK_AVATAR_KEYS,
  getAvatarForSource,
  type FeedbackAvatarKey,
} from "@shared/feedback-avatar-map";

const SESSION_KEY = "axtask.feedbackNudge.count";
const SESSION_CAP = 10;
const DAY_KEY = "axtask.feedbackNudge.day";
const DAY_CAP = 14;
const DAY_COUNT_KEY = "axtask.feedbackNudge.dayCount";
const LAST_AT_KEY = "axtask.feedbackNudge.lastAt";
const SOURCE_COUNTS_KEY = "axtask.feedbackNudge.sources";
const SOURCE_SCORE_KEY = "axtask.feedbackNudge.sourceScore";
const AVATAR_COUNTS_KEY = "axtask.feedbackNudge.avatarCounts";
const AVATAR_LAST_AT_KEY = "axtask.feedbackNudge.avatarLastAt";
const NOTIFICATION_ENABLED_KEY = "axtask.notification.enabled";
/**
 * Hybrid cache for the per-avatar slider preferences. Written-through from the
 * server response on `GET /api/notifications/preferences` load so the nudge
 * logic can make decisions offline/before the query resolves.
 */
export const FEEDBACK_PREFS_CACHE_KEY = "axtask.feedbackNudgePrefs";

const FALLBACK_COOLDOWN_MS = 90_000;
const FALLBACK_SOURCE_CAP = 2;

export type FeedbackNudgePrefsCache = {
  master: number;
  byAvatar: Partial<Record<FeedbackAvatarKey, number>>;
};

export type FeedbackNudgePolicy = {
  cooldownMs: number;
  sourceCap: number;
  dayCap: number;
  dayScoreCap: number;
  avatarCap: number;
  avatarCooldownMs: number;
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

function clampIntensity(n: number): number {
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function readFeedbackPrefsCache(): FeedbackNudgePrefsCache {
  if (typeof window === "undefined") return { master: 50, byAvatar: {} };
  const raw = safeReadJson<Partial<FeedbackNudgePrefsCache>>(
    localStorage.getItem(FEEDBACK_PREFS_CACHE_KEY),
    { master: 50, byAvatar: {} },
  );
  const master = clampIntensity(Number(raw?.master ?? 50));
  const byAvatarSrc: Record<string, unknown> =
    raw && typeof raw === "object" && raw.byAvatar && typeof raw.byAvatar === "object"
      ? (raw.byAvatar as Record<string, unknown>)
      : {};
  const byAvatar: Partial<Record<FeedbackAvatarKey, number>> = {};
  for (const key of FEEDBACK_AVATAR_KEYS) {
    const v = byAvatarSrc[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      byAvatar[key] = clampIntensity(v);
    }
  }
  return { master, byAvatar };
}

/** Persist a copy of server-sourced prefs locally for instant, offline reads. */
export function writeFeedbackPrefsCache(prefs: FeedbackNudgePrefsCache): void {
  if (typeof window === "undefined") return;
  try {
    const normalized: FeedbackNudgePrefsCache = {
      master: clampIntensity(prefs.master),
      byAvatar: {},
    };
    for (const key of FEEDBACK_AVATAR_KEYS) {
      const v = prefs.byAvatar?.[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        normalized.byAvatar[key] = clampIntensity(v);
      }
    }
    localStorage.setItem(FEEDBACK_PREFS_CACHE_KEY, JSON.stringify(normalized));
  } catch {
    /* ignore quota / privacy mode */
  }
}

/**
 * Compose master × per-avatar intensity. When the avatar slider is unset the
 * effective value equals `master`; when present it acts as a *multiplier* in
 * percentage terms, so a master of 80 and an avatar slider of 25 produces an
 * effective intensity of 20 (80 × 25 / 100).
 */
export function computeEffectiveIntensity(
  prefs: FeedbackNudgePrefsCache,
  avatarKey: FeedbackAvatarKey,
): number {
  const master = clampIntensity(prefs.master);
  const byAvatar = prefs.byAvatar?.[avatarKey];
  if (typeof byAvatar !== "number" || !Number.isFinite(byAvatar)) {
    return master;
  }
  return clampIntensity((master * clampIntensity(byAvatar)) / 100);
}

/**
 * Derive the rate-limiting policy for a given composed intensity. Exposed for
 * unit tests so they can assert behavior without monkey-patching localStorage.
 */
export function getFeedbackNudgePolicy(
  effectiveIntensity: number,
  notificationEnabled: boolean,
): FeedbackNudgePolicy {
  if (!notificationEnabled) {
    return {
      cooldownMs: FALLBACK_COOLDOWN_MS,
      sourceCap: FALLBACK_SOURCE_CAP,
      dayCap: 6,
      dayScoreCap: 12,
      avatarCap: 3,
      avatarCooldownMs: 240_000,
    };
  }
  if (effectiveIntensity <= 0) {
    return {
      cooldownMs: Number.POSITIVE_INFINITY,
      sourceCap: 0,
      dayCap: 0,
      dayScoreCap: 0,
      avatarCap: 0,
      avatarCooldownMs: Number.POSITIVE_INFINITY,
    };
  }
  if (effectiveIntensity <= 30) {
    return {
      cooldownMs: 180_000,
      sourceCap: 2,
      dayCap: 5,
      dayScoreCap: 10,
      avatarCap: 2,
      avatarCooldownMs: 360_000,
    };
  }
  if (effectiveIntensity <= 70) {
    return {
      cooldownMs: 90_000,
      sourceCap: 3,
      dayCap: 8,
      dayScoreCap: 16,
      avatarCap: 4,
      avatarCooldownMs: 180_000,
    };
  }
  /* High intensity: broader coverage before repeat, not just faster repeats. */
  return {
    cooldownMs: 45_000,
    sourceCap: 8,
    dayCap: DAY_CAP,
    dayScoreCap: 36,
    avatarCap: 6,
    avatarCooldownMs: 60_000,
  };
}

function sourceWeight(source: string): number {
  const key = source.trim().toLowerCase();
  if (key.includes("feedback")) return 1;
  if (key.includes("rating")) return 2;
  if (key.includes("recalculate")) return 2;
  if (key.includes("classification")) return 3;
  if (key.includes("complete")) return 3;
  if (key.includes("redeem")) return 2;
  return 1;
}

function isActiveElementInsideFeedbackGuard(): boolean {
  if (typeof document === "undefined") return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest('[data-feedback-guard="true"]'));
}

/** Fire-and-forget hook for embedding feedback prompts after meaningful actions. */
export function requestFeedbackNudge(source: string): void {
  if (typeof window === "undefined") return;
  if (isActiveElementInsideFeedbackGuard()) return;
  try {
    const prefs = readFeedbackPrefsCache();
    const avatarKey: FeedbackAvatarKey = getAvatarForSource(source) ?? DEFAULT_FEEDBACK_AVATAR;
    const effective = computeEffectiveIntensity(prefs, avatarKey);
    const enabled = localStorage.getItem(NOTIFICATION_ENABLED_KEY) === "true";
    const policy = getFeedbackNudgePolicy(effective, enabled);
    if (policy.cooldownMs === Number.POSITIVE_INFINITY) return;

    const now = Date.now();
    const lastAt = Number(localStorage.getItem(LAST_AT_KEY) || "0") || 0;
    if (lastAt > 0 && now - lastAt < policy.cooldownMs) return;

    const avatarLastAt = safeReadJson<Record<string, number>>(
      localStorage.getItem(AVATAR_LAST_AT_KEY),
      {},
    );
    const avatarLast = Number(avatarLastAt[avatarKey] || 0) || 0;
    if (avatarLast > 0 && now - avatarLast < policy.avatarCooldownMs) return;

    const sourceKey = source.trim().toLowerCase() || "unknown";
    const sourceCounts = safeReadJson<Record<string, number>>(
      localStorage.getItem(SOURCE_COUNTS_KEY),
      {},
    );
    const sourceSeen = Number(sourceCounts[sourceKey] || 0);
    if (sourceSeen >= policy.sourceCap) return;

    const avatarCounts = safeReadJson<Record<string, number>>(
      localStorage.getItem(AVATAR_COUNTS_KEY),
      {},
    );
    const avatarSeen = Number(avatarCounts[avatarKey] || 0);
    if (avatarSeen >= policy.avatarCap) return;

    const day = isoDayNow();
    const storedDay = localStorage.getItem(DAY_KEY);
    const dayCount = Number(localStorage.getItem(DAY_COUNT_KEY) || "0") || 0;
    const nextDayCount = storedDay === day ? dayCount + 1 : 1;
    if (nextDayCount > policy.dayCap) return;
    const dayScore = Number(localStorage.getItem(SOURCE_SCORE_KEY) || "0") || 0;
    const nextScore = storedDay === day ? dayScore + sourceWeight(sourceKey) : sourceWeight(sourceKey);
    if (nextScore > policy.dayScoreCap) return;

    const n = Number(sessionStorage.getItem(SESSION_KEY) || "0") || 0;
    if (n >= SESSION_CAP) return;

    sessionStorage.setItem(SESSION_KEY, String(n + 1));
    localStorage.setItem(DAY_KEY, day);
    localStorage.setItem(DAY_COUNT_KEY, String(nextDayCount));
    localStorage.setItem(SOURCE_SCORE_KEY, String(nextScore));
    localStorage.setItem(LAST_AT_KEY, String(now));
    sourceCounts[sourceKey] = sourceSeen + 1;
    localStorage.setItem(SOURCE_COUNTS_KEY, JSON.stringify(sourceCounts));
    avatarCounts[avatarKey] = avatarSeen + 1;
    localStorage.setItem(AVATAR_COUNTS_KEY, JSON.stringify(avatarCounts));
    avatarLastAt[avatarKey] = now;
    localStorage.setItem(AVATAR_LAST_AT_KEY, JSON.stringify(avatarLastAt));
    window.dispatchEvent(
      new CustomEvent("axtask-feedback-nudge", {
        detail: { source, avatarKey },
      }),
    );
  } catch {
    /* ignore quota / privacy mode */
  }
}
