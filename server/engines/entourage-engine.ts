import type { Task, TaskPattern } from "@shared/schema";
import {
  storage,
  getPatterns,
  getCompletedTaskCount,
  getUserClassificationStats,
  countTasksWhereUserIsCollaborator,
  getDominantClassificationForUser,
  getOrCreateWallet,
  getUserEntourageRow,
  upsertUserEntourageRow,
  getUserNotificationPreference,
} from "../storage";

const ENT_CACHE_MS = 60 * 60 * 1000;

export async function getOrRecomputeEntourage(userId: string, force = false): Promise<EntouragePayload> {
  if (!force) {
    const row = await getUserEntourageRow(userId);
    if (row?.computedAt && Date.now() - new Date(row.computedAt).getTime() < ENT_CACHE_MS) {
      try {
        return JSON.parse(row.payloadJson) as EntouragePayload;
      } catch {
        /* fall through */
      }
    }
  }
  const payload = await computeEntouragePayload(userId);
  await upsertUserEntourageRow(userId, JSON.stringify(payload));
  return payload;
}

export type EntourageSlot = "mood" | "archetype" | "productivity" | "social" | "lazy";

export type EntourageCompanion = {
  slot: EntourageSlot;
  key: string;
  label: string;
  description: string;
  tier: number;
};

export type EntouragePayload = {
  companions: EntourageCompanion[];
  computedAt: string;
};

const MOOD = {
  steady: { key: "steady", label: "Steady", description: "Balanced rhythm across your tasks." },
  streak: { key: "streak", label: "On fire", description: "Strong completion streak — keep the momentum." },
  overloaded: { key: "overloaded", label: "Juggling", description: "Lots open at once; small wins add up." },
  calm: { key: "calm", label: "Calm", description: "Light load — room to explore or deepen work." },
} as const;

const ARCH = {
  generalist: { key: "generalist", label: "Generalist", description: "Varied work across many themes." },
  specialist: { key: "specialist", label: "Specialist", description: "Deep focus in one classification." },
  explorer: { key: "explorer", label: "Explorer", description: "Still mapping your task landscape." },
} as const;

const PROD = {
  starter: { key: "starter", label: "Starter", description: "Building your completion habit." },
  grinder: { key: "grinder", label: "Grinder", description: "Solid output — tasks cleared regularly." },
  veteran: { key: "veteran", label: "Veteran", description: "High completion volume over time." },
} as const;

const SOC = {
  solo: { key: "solo", label: "Solo", description: "Mostly your own lane; collab when it counts." },
  connector: { key: "connector", label: "Connector", description: "You share tasks and show up for others." },
  catalyst: { key: "catalyst", label: "Catalyst", description: "Heavy social signal — classifying and collaborating." },
} as const;

async function lazyCompanionFromSignals(
  userId: string,
  openCount: number,
  completed: number,
): Promise<EntourageCompanion> {
  const pref = await getUserNotificationPreference(userId);
  const intensity = pref.intensity ?? 50;

  if (openCount >= 18) {
    return {
      slot: "lazy",
      key: "triage_buddy",
      label: "Triage Buddy",
      description: "Big queue — pick one humane next step, breathe, then the next.",
      tier: tierFromScore(openCount, 45),
    };
  }
  if (intensity >= 72) {
    return {
      slot: "lazy",
      key: "unplug_nudge",
      label: "Unplug Nudge",
      description: "Pings are cranked up; gratitude lands softer. Ease the notification slider when you can.",
      tier: 3,
    };
  }
  if (intensity <= 40) {
    return {
      slot: "lazy",
      key: "slow_lane",
      label: "Slow Lane Sage",
      description: "Gentle notification pace — perfect for savoring what you already finished.",
      tier: 4,
    };
  }
  return {
    slot: "lazy",
    key: "gratitude_guide",
    label: "Lazy Lou",
    description: "Talk through priorities, tough calls, and what you are thankful for — rest counts.",
    tier: tierFromScore(completed, 60),
  };
}

function tierFromScore(score: number, max: number): number {
  if (max <= 0) return 1;
  const t = Math.ceil((score / max) * 5);
  return Math.min(5, Math.max(1, t));
}

function moodFromSignals(patterns: TaskPattern[], streak: number, openCount: number, completed: number): EntourageCompanion {
  const patternBoost = patterns.length >= 5 ? 1 : 0;
  if (streak >= 7) {
    return { slot: "mood", ...MOOD.streak, tier: tierFromScore(streak + patternBoost, 30) };
  }
  if (openCount > 25 && completed < openCount) {
    return { slot: "mood", ...MOOD.overloaded, tier: tierFromScore(openCount, 40) };
  }
  if (openCount < 5 && completed > 10) {
    return { slot: "mood", ...MOOD.calm, tier: 4 };
  }
  return { slot: "mood", ...MOOD.steady, tier: tierFromScore(completed + patternBoost, 50) };
}

function archetypeFromClassification(dominant: string | null, completed: number): EntourageCompanion {
  if (!dominant || dominant === "General" || completed < 5) {
    return { slot: "archetype", ...ARCH.explorer, tier: 2 };
  }
  if (completed >= 30) {
    return {
      slot: "archetype",
      ...ARCH.specialist,
      label: `${dominant} lead`,
      description: `Your completed work clusters around “${dominant}”.`,
      tier: 4,
    };
  }
  return { slot: "archetype", ...ARCH.generalist, tier: 3 };
}

function productivityFromCounts(completed: number, streak: number, longest: number): EntourageCompanion {
  const score = completed + streak * 2 + longest;
  if (completed >= 100) {
    return { slot: "productivity", ...PROD.veteran, tier: tierFromScore(score, 200) };
  }
  if (completed >= 15) {
    return { slot: "productivity", ...PROD.grinder, tier: tierFromScore(score, 80) };
  }
  return { slot: "productivity", ...PROD.starter, tier: tierFromScore(score, 30) };
}

function socialFromStats(
  stats: { totalClassifications: number; totalConfirmationsReceived: number; totalClassificationCoins: number },
  collabCount: number,
): EntourageCompanion {
  const socialScore =
    stats.totalClassifications * 2 + stats.totalConfirmationsReceived + stats.totalClassificationCoins / 10 + collabCount * 5;
  if (socialScore >= 80) {
    return { slot: "social", ...SOC.catalyst, tier: tierFromScore(socialScore, 150) };
  }
  if (socialScore >= 15 || collabCount >= 2) {
    return { slot: "social", ...SOC.connector, tier: tierFromScore(socialScore, 80) };
  }
  return { slot: "social", ...SOC.solo, tier: 2 };
}

export async function computeEntouragePayload(userId: string): Promise<EntouragePayload> {
  const [patterns, completed, stats, collabCount, dominant, wallet, allTasks] = await Promise.all([
    getPatterns(userId),
    getCompletedTaskCount(userId),
    getUserClassificationStats(userId),
    countTasksWhereUserIsCollaborator(userId),
    getDominantClassificationForUser(userId),
    getOrCreateWallet(userId),
    storage.getTasks(userId),
  ]);

  const openCount = allTasks.filter((t: Task) => t.status !== "completed").length;
  const streak = wallet.currentStreak ?? 0;
  const longest = wallet.longestStreak ?? 0;

  const lazy = await lazyCompanionFromSignals(userId, openCount, completed);

  const companions: EntourageCompanion[] = [
    moodFromSignals(patterns, streak, openCount, completed),
    archetypeFromClassification(dominant, completed),
    productivityFromCounts(completed, streak, longest),
    socialFromStats(stats, collabCount),
    lazy,
  ];

  return {
    companions,
    computedAt: new Date().toISOString(),
  };
}
