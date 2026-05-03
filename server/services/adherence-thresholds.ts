export type AdherenceThresholds = {
  missedDueMinutes: number;
  reminderIgnoredMinutes: number;
  streakDropDays: number;
  noEngagementDays: number;
  signalCooldownHours: number;
  staleEvalMinutes: number;
  cronIntervalMs: number;
};

function readNumber(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

export function getAdherenceThresholds(): AdherenceThresholds {
  return {
    missedDueMinutes: readNumber("ADHERENCE_MISSED_DUE_MINUTES", 60),
    reminderIgnoredMinutes: readNumber("ADHERENCE_REMINDER_IGNORED_MINUTES", 120),
    streakDropDays: readNumber("ADHERENCE_STREAK_DROP_DAYS", 1),
    noEngagementDays: readNumber("ADHERENCE_NO_ENGAGEMENT_DAYS", 3),
    signalCooldownHours: readNumber("ADHERENCE_SIGNAL_COOLDOWN_HOURS", 12),
    staleEvalMinutes: readNumber("ADHERENCE_STALE_EVAL_MINUTES", 30),
    cronIntervalMs: readNumber("ADHERENCE_CRON_INTERVAL_MS", 5 * 60 * 1000),
  };
}

export function isAdherenceEnabled(): boolean {
  return (process.env.ADHERENCE_INTERVENTIONS_ENABLED || "").trim().toLowerCase() === "true";
}

