export type SkillBenefitType = "coin_multiplier" | "cap_raise" | "feature_unlock" | "passive_bonus";

export interface SkillBenefit {
  label: string;
  description: string;
  type: SkillBenefitType;
}

export const SKILL_BENEFITS: Record<string, SkillBenefit> = {
  "discipline-1": {
    label: "+10% Base Coins",
    description: "Every task completion awards 10% more base coins automatically.",
    type: "coin_multiplier",
  },
  "planning-1": {
    label: "Raised On-Time Bonus",
    description: "On-time completion bonus raised from 50% to 65% of base coins.",
    type: "coin_multiplier",
  },
  "focus-1": {
    label: "Earlier Streak Multiplier",
    description: "Streak multiplier now activates after just 2 consecutive days instead of 3.",
    type: "passive_bonus",
  },
  "systems-1": {
    label: "Better Cleanup Rewards",
    description: "Cleanup bonus raised from 4 to 6 coins; stale task threshold lowered from 7 to 5 days.",
    type: "passive_bonus",
  },
  "discipline-2": {
    label: "Extended Streak Cap + Monthly Shield",
    description: "Streak bonus cap raised from 30-day to 40-day max; receive +1 free streak shield on the 1st of each month.",
    type: "cap_raise",
  },
  "planning-2": {
    label: "Higher Investment Returns",
    description: "Classification investment interest rate raised from 8% to 12% compound per confirmation.",
    type: "coin_multiplier",
  },
  "focus-2": {
    label: "+80% Badge Coin Awards",
    description: "Badge coin award raised from 10 to 18 coins per badge earned.",
    type: "coin_multiplier",
  },
  "systems-2": {
    label: "+15% Global Coin Multiplier",
    description: "All coin rewards increased by 15% globally; streak badge awards raised from 15 to 25 coins.",
    type: "coin_multiplier",
  },
};
