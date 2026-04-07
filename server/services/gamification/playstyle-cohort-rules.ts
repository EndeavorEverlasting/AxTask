/**
 * Pure playstyle → cohort rules (no database). Used by rollups and unit tests.
 */
export const PLAYSTYLE_ASSIGNMENT_VERSION = "playstyle_v1";

export type PlaystyleSignals = {
  events: number;
  taskRatio: number;
  socialRatio: number;
  postRatio: number;
  productivityShare: number;
  archetypeShare: number;
  moodShare: number;
  socialAvatarShare: number;
  classificationScore: number;
  coinEvents: number;
  maxAvatarConcentration: number;
};

export const COHORT_KEYS = [
  "latent_player",
  "completionist_driver",
  "social_weaver",
  "optimizer_grinder",
  "archetype_specialist",
  "balanced_multiclass",
] as const;

export type PlaystyleCohortKey = (typeof COHORT_KEYS)[number];

export function assignPlaystyleCohort(s: PlaystyleSignals): PlaystyleCohortKey {
  const n = Math.max(0, s.events);
  if (n < 4) return "latent_player";

  if (s.maxAvatarConcentration >= 0.72 && n >= 8) {
    return "archetype_specialist";
  }

  if (s.socialRatio >= 0.48 && s.taskRatio < 0.42) {
    return "social_weaver";
  }

  if (s.taskRatio >= 0.52 && s.productivityShare >= 0.22) {
    return "completionist_driver";
  }

  if (s.classificationScore >= 0.32 || s.coinEvents >= 18) {
    return "optimizer_grinder";
  }

  return "balanced_multiclass";
}

export function meanPlaystyleSignals(rows: PlaystyleSignals[]): Record<string, number> {
  if (rows.length === 0) return {};
  const keys = Object.keys(rows[0]) as (keyof PlaystyleSignals)[];
  const out: Record<string, number> = {};
  for (const k of keys) {
    const sum = rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    out[k] = Math.round((sum / rows.length) * 10000) / 10000;
  }
  return out;
}
