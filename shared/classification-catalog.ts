/** Canonical built-in labels used across AxTask + NodeWeaver profiles. */
export const BUILT_IN_CLASSIFICATIONS = [
  { label: "Crisis", coins: 15 },
  { label: "Research", coins: 12 },
  { label: "Development", coins: 10 },
  { label: "Meeting", coins: 8 },
  { label: "Maintenance", coins: 8 },
  { label: "Administrative", coins: 6 },
  { label: "General", coins: 0 },
] as const;

export type BuiltInClassificationLabel = (typeof BUILT_IN_CLASSIFICATIONS)[number]["label"];

export function isBuiltInClassification(label: string): boolean {
  const key = label.trim().toLowerCase();
  return BUILT_IN_CLASSIFICATIONS.some((c) => c.label.toLowerCase() === key);
}

export function builtInCoinReward(label: string): number | undefined {
  const key = label.trim().toLowerCase();
  const row = BUILT_IN_CLASSIFICATIONS.find((c) => c.label.toLowerCase() === key);
  return row?.coins;
}

export function normalizeCategoryName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export function isGeneralClassification(label: string): boolean {
  return label.trim().toLowerCase() === "general";
}
