const EFFECT_LABELS: Record<string, string> = {
  entourage_slots: "companion slots",
  guidance_depth: "guidance depth",
  context_points: "context points",
  resource_budget: "resource budget",
  export_coin_discount: "export discount",
  shopping_list_surface: "shopping list workspace",
  rate_pct: "% offline coin rate",
  capacity_hours: "h offline capacity",
};

export function formatSkillEffect(effectType: string, perLevel: number): string {
  const label = EFFECT_LABELS[effectType] ?? effectType.replace(/_/g, " ");
  if (effectType === "rate_pct") return `+${perLevel}% offline coin rate / level`;
  if (effectType === "capacity_hours") return `+${perLevel}h offline capacity / level`;
  if (effectType === "export_coin_discount") return `-${perLevel} coin export cost / level`;
  if (effectType === "shopping_list_surface") return "unlocks shopping list + checklist exports";
  return `+${perLevel} ${label} / level`;
}
