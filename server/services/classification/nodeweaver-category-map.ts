/**
 * Maps NodeWeaver `predicted_category` strings onto AxTask primary labels.
 * Returns null when the model label should not override local fallbacks.
 */

const CANONICAL_LABELS = [
  "Crisis",
  "Development",
  "Meeting",
  "Research",
  "Maintenance",
  "Administrative",
  "Shopping",
  "General",
  "Finance",
  "Security",
  "Support",
  "Design",
] as const;

const SHOPPING_PATTERN =
  /\b(shopping|grocery|groceries|errands?|retail|supermarket|market|store\s*run|purchase|procurement|supplies)\b/i;

export function mapNodeWeaverCategoryToAxTaskLabel(predicted: string): string | null {
  const raw = predicted.trim();
  if (!raw) return null;
  const spaced = raw.replace(/[_-]+/g, " ");
  if (SHOPPING_PATTERN.test(spaced)) return "Shopping";

  const lower = raw.toLowerCase();
  for (const label of CANONICAL_LABELS) {
    if (lower === label.toLowerCase()) return label;
  }

  const collapsed = lower.replace(/[\s_-]+/g, "");
  const aliasToLabel: Record<string, (typeof CANONICAL_LABELS)[number]> = {
    dev: "Development",
    coding: "Development",
    software: "Development",
    admin: "Administrative",
    paperwork: "Administrative",
    meet: "Meeting",
    calls: "Meeting",
    research: "Research",
    maintenance: "Maintenance",
    ops: "Maintenance",
    finance: "Finance",
    security: "Security",
    support: "Support",
    design: "Design",
    general: "General",
    misc: "General",
    other: "General",
  };
  const mapped = aliasToLabel[collapsed];
  return mapped ?? null;
}
