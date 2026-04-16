export type NotificationIntensityBand = "off" | "low" | "balanced" | "frequent";

export type NotificationDispatchProfile = {
  intensity: number;
  band: NotificationIntensityBand;
  cadenceMinutes: number | null;
  maxPerDay: number;
  feedbackCooldownSeconds: number | null;
  feedbackMaxPerDay: number;
};

function clampIntensity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getNotificationDispatchProfile(intensityInput: number): NotificationDispatchProfile {
  const intensity = clampIntensity(intensityInput);
  if (intensity <= 0) {
    return {
      intensity,
      band: "off",
      cadenceMinutes: null,
      maxPerDay: 0,
      feedbackCooldownSeconds: null,
      feedbackMaxPerDay: 0,
    };
  }
  if (intensity <= 30) {
    return {
      intensity,
      band: "low",
      cadenceMinutes: 360,
      maxPerDay: 3,
      feedbackCooldownSeconds: 180,
      feedbackMaxPerDay: 4,
    };
  }
  if (intensity <= 70) {
    return {
      intensity,
      band: "balanced",
      cadenceMinutes: 120,
      maxPerDay: 8,
      feedbackCooldownSeconds: 90,
      feedbackMaxPerDay: 8,
    };
  }
  return {
    intensity,
    band: "frequent",
    cadenceMinutes: 30,
    maxPerDay: 24,
    feedbackCooldownSeconds: 45,
    feedbackMaxPerDay: 12,
  };
}

export function shouldDispatchByIntensity(input: {
  intensity: number;
  lastSentAt?: Date | null;
  now?: Date;
}): boolean {
  const profile = getNotificationDispatchProfile(input.intensity);
  if (profile.band === "off") return false;
  if (!input.lastSentAt || !profile.cadenceMinutes) return true;
  const now = input.now || new Date();
  const elapsedMs = now.getTime() - input.lastSentAt.getTime();
  return elapsedMs >= profile.cadenceMinutes * 60 * 1000;
}
